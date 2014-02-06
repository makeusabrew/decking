fs            = require "fs"
child_process = require "child_process"
async         = require "async"
DepTree       = require "deptree"
Docker        = require "dockerode"
JSONStream    = require "JSONStream"

Parser = require "./parser"
Runner = require "./runner"

MultiplexStream = require "./multiplex_stream"

docker = new Docker socketPath: "/var/run/docker.sock"
logger = process.stdout
log    = (data) -> logger.write "#{data}\n"

version = require("#{__dirname}/../package.json").version

module.exports =
class Decking
  constructor: ({@command, @args} = {}) ->
    @args ?= []
    @config = {}

  parseConfig: (data) -> JSON.parse data

  loadConfig: (file) ->
    Parser.load @parseConfig fs.readFileSync file

  commands:
    help: (done) ->
      log ""
      help =
      """
      Usage: decking COMMAND [arg...]

      Commands:
        build    build an image or pass 'all' to build all
        create   create a cluster of containers
        start    start a cluster
        stop     stop a cluster
        restart  restart a cluster
        status   check the status of a cluster's containers
        attach   attach to all running containers in a cluster

      Version: #{version}

      """

      log help

      done null

    build: (done) ->
      [image] = @args

      if image is "all"
        images = (key for key,val of @config.images)

        async.eachSeries images,
        (image, callback) =>
          @build image, callback
        , done
      else
        @build image, done

    create: (done) -> @_run "create", done
    start: (done) -> @_run "start", done
    stop: (done) -> @_run "stop", done
    restart: (done) -> @_run "restart", done
    status: (done) -> @_run "status", done
    attach: (done) -> @_run "attach", done

  _run: (cmd, done) ->
    [cluster] = @args

    if not cluster
      throw new Error "Please supply a cluster name" if Object.keys(@config.clusters).length isnt 1

      # no cluster specified, but there's only one, so just default to it
      cluster = key for key of @config.clusters
      log "Defaulting to cluster '#{cluster}'"

    target = @config.clusters[cluster]

    throw new Error "Cluster #{cluster} does not exist in decking.json"  if not target

    if target.group
      log "Using overrides from group '#{target.group}'\n"

    this[cmd](target, done)

  start: (cluster, done) ->

    iterator = (details, callback) ->
      name = details.name
      container = docker.getContainer name
      isRunning container, (err, running) ->
        if not running
          logAction name, "starting..."
          container.start callback
        else
          logAction name, "skipping (already running)"
          callback null

    resolveOrder @config, cluster, (list) ->

      validateContainerPresence list, (err) ->
        return done err if err

        async.eachSeries list, iterator, done


  stop: (cluster, done) ->

    # @TODO reverse dependency order? shutdown process might
    # involve signalling to them (e.g. final write, disconnect)

    iterator = (details, callback) ->
      name = details.name
      container = docker.getContainer name
      isRunning container, (err, running) ->
        if running
          logAction name, "stopping..."
          container.stop callback
        else
          logAction name, "skipping (already stopped)"
          callback null

    resolveOrder @config, cluster, (list) ->

      validateContainerPresence list, (err) ->
        return done err if err

        async.eachSeries list, iterator, done

  restart: (cluster, done) ->
    iterator = (details, callback) ->
      name = details.name
      container = docker.getContainer name
      isRunning container, (err, running) ->
        if running
          logAction name, "restarting..."
          container.stop (err) ->
            container.start callback
        else
          logAction name, "starting..."
          container.start callback

    resolveOrder @config, cluster, (list) ->

      validateContainerPresence list, (err) ->
        return done err if err

        async.eachSeries list, iterator, done

  attach: (cluster, done) ->

    timeout = 600

    reAttach = (name, container, attempts = 0) ->
      setTimeout ->
        isRunning container, (err, running) ->
          if running
            attach name, container, false, ->
              logAction name, "re-attached"
          else
            if attempts < 100
              reAttach name, container, attempts + 1
            else
              logAction name, "max re-attach attempts reached, bailing..."
      , timeout

    attach = (name, container, fetchLogs, callback) ->
      options =
        stream: true
        stdout: true
        stderr: true
        tty: false
        logs: fetchLogs

      container.attach options, (err, stream) ->
        new MultiplexStream container, stream, padName(name, "(", ")")

        stream.on "end", ->
          logAction name, "gone away, will try to re-attach for one minute..."
          reAttach name, container

        callback? err

    iterator = (details, callback) ->
      container = docker.getContainer details.name
      attach details.name, container, true, callback

    resolveOrder @config, cluster, (list) ->

      validateContainerPresence list, (err) ->
        return done err if err

        async.eachSeries list, iterator, done

  status: (cluster, done) ->

    iterator = (details, callback) ->
      name = details.name
      container = docker.getContainer name
      container.inspect (err, data) ->
        if err # @TODO inspect
          logAction name, "does not exist"
        else if data.State.Running
          str = "running  "
          ip = data.NetworkSettings.IPAddress
          str += ip
          for local,host of data.NetworkSettings.Ports
            host = host?[0]
            str += "  "
            if host
              str += "#{host.HostIp}:#{host.HostPort}->"
            str += local
          logAction name, str
        else
          logAction name, "stopped"

        callback null

    resolveOrder @config, cluster, (list) ->
      async.eachSeries list, iterator, done

  create: (cluster, done) ->
    # create a container based on metadata
    # for now due to remote API limitations this
    # is going to be a `run` followed quickly by a `stop`
    # @TODO use the remote API when it supports -name and -link
    # @TODO check the target image exists locally, otherwise
    # `docker run` will try to download it. we want to take care
    # of dependency resolution ourselves

    commands = []

    fetchIterator = (details, callback) ->
      name = details.name
      container = docker.getContainer name

      command =
        name: name
        container: container

      container.inspect (err, data) ->
        if not err
          command.exists = true
          commands.push command
          return callback null

        # basic args we know we'll need

        # this starts to get a bit messy; we have to loop over
        # our container's options and using a closure bind a
        # function to run against each key/val - a function which
        # can potentially be asynchronous
        # we bung all these closures in an array which we *then*
        # pass to async. can't just use async.each here as that
        # only works on arrays
        run = []
        sortedArgs = Runner.sortArgs details.object
        for key,val of sortedArgs
          # don't need to bind 'details', it doesn't change
          do (key, val) ->
            # run is going to be fed into async.series, it expects
            # to only fire a callback per iteration...
            run.push (done) -> Runner.getArg key, val, details, done

        # now we've got our array of getRunArg calls bound to the right
        # variables, run them in order and add the results to the initial
        # run command
        async.series run, (err, results) ->
          throw err if err
          command.exec = Runner.formatArgs name, results

          console.log command.exec
          process.exit 0
          commands.push command

          callback null

    createIterator = (command, callback) ->
      name = command.name

      if command.exists
        # already exists, BUT it might be a dependency so it needs starting
        #log "Container #{name} already exists, skipping..."
        # @TODO check if this container has dependents or not...
        logAction name, "already exists - running in case of dependents"
        return isRunning command.container, (err, running) ->
          return command.container.start callback if not running

          # container exists AND is running - stop, restart
          return command.container.stop (err) ->
            command.container.start callback

      logAction name, "creating..."

      child_process.exec command.exec, callback

    stopIterator = (details, callback) ->
      container = docker.getContainer details.name
      container.stop callback

    resolveOrder @config, cluster, (list) ->
      async.eachSeries list, fetchIterator, (err) ->
        throw err if err
        async.eachSeries commands, createIterator, (err) ->
          throw err if err
          # @FIXME hack to avoid ghosts with quick start/stop combos
          setTimeout ->
            async.eachLimit list, 5, stopIterator, done
          , 500

  build: (image, done) ->

    throw new Error("Please supply an image name to build") if not image

    log "Looking up build data for #{image}"

    target = @config.images[image]

    throw new Error("Image #{image} does not exist in decking.json") if not target

    targetPath = "#{target}/Dockerfile"

    log "Building image #{image} from #{targetPath}"

    # @TODO for now, always assume we want to build from a Dockerfile
    # @TODO need a lot of careful validation here
    fs.createReadStream(targetPath).pipe fs.createWriteStream("./Dockerfile")

    options =
      t: image

    if @hasArg "--no-cache"
      log "Not using image cache"
      options.nocache = true

    log "Uploading compressed context..."

    # @TODO allow user to specifiy --exclude params to avoid unnecessarily huge tarballs
    tar = child_process.spawn "tar", ["-c", "-", "./"]

    docker.buildImage tar.stdout, options, (err, res) ->
      fs.unlink "./Dockerfile", (err) -> log "[WARN] Could not remove Dockerfile" if err

      return done err if err

      if res.headers["content-type"] is "application/json"
        res
          .pipe(JSONStream.parse "stream")
          .pipe(process.stdout)
      else
        # we don't need an if/else but let's keep it for clarity; it'd be too easy to
        # skim-read the code and misinterpret the first pipe otherwise
        res
          .pipe(process.stdout)

      res.on "end", done

  execute: (done) ->
    @command = "help" if not @command or @command is "-h" or @command is "--help"
    fn = @commands[@command]

    throw new Error "Unknown method #{@command}" if typeof fn isnt "function"

    @config = @loadConfig "./decking.json" if @command isnt "help"

    return fn.call this, (err) -> throw err if err

  hasArg: (arg) -> @args.indexOf(arg) isnt -1

maxNameLength = 0

padName = (name, prefix = "", suffix = "") ->
  pad = (maxNameLength + 1) - name.length
  return "#{prefix}#{name}#{suffix}#{Array(pad).join(" ")}"

logAction = (name, message) ->

  log "#{padName(name)}  #{message}"

hasDependency = (containers, dependency) ->
  return findContainer(containers, dependency) isnt null

findContainer = (containers, name) ->
  for container in containers
    # @TODO remove originalName hack
    return container if container.originalName is name or container.name is name

  return null

# Cluster.sort() ?
sortCluster = (containers) ->
  # resolve dependency order
  depTree = new DepTree
  for container in containers
    depTree.add container.originalName, container.object.dependencies

  (findContainer(containers, item) for item in depTree.resolve())

# @TODO rename; this does more than just order resolution now!
# resolveClusterContainers?
# Cluster.resolveContainers?
resolveOrder = (config, cluster, callback) ->
  if cluster.group
    # right! specifying a group modifier. let's pump it up...
    groupName = cluster.group
    group = config.groups[groupName]

  containers = []

  for container in cluster.containers
    # check for implicit members (unnamed container dependencies)
    for dependency in container.object.dependencies
      if not hasDependency cluster.containers, dependency
        container =
          name: dependency
          # if this dependency isn't named in the cluster it can't have a node
          # count, so give it the default...
          count: 1
          object: config.containers[dependency]
        cluster.containers.push container

  containers = cluster.containers

  # rename any containers based on group stuff, calc some max length stuff
  # merge group overrides if present
  # @TODO Cluster.mergeOverrides
  for container in containers
    container.originalName = container.name

    if groupName
      container.group = groupName
      # @FIXME stop overwriting the name property! create a separate variable
      # called instanceName or something. obj.name always wants to
      # be the 'canonical' name
      container.name += ".#{groupName}"

      # first up, completely replace any container config with
      # the group-wide options
      # @TODO merge instead of replace?
      for key, value of group.options
        container.object[key] = value

      # now check for container specific overrides...
      if group.containers?[container.originalName]?
        for key, value of group.containers[container.originalName]
          # @TODO we're overwriting here, these should MERGE with
          # those specified group-wide... I think. But only if there
          # was a group wide key maybe?
          container.object[key] = value

    # just used for formatting so we pad the container names equally
    length = container.name.length
    # this is a multi-node definition so we'll suffix it .(n) in a minute
    # we can't do it here because we don't have unique objects for each
    # n instance; we just have one canonical container at this point
    length += container.count.toString().length if container.count > 1
    maxNameLength = length if length > maxNameLength

  list = sortCluster containers

  # nearly there, we've got a flattened list, but we need to make sure we have
  # the correct number of nodes for each container
  # @TODO Cluster.xxx
  final = []
  for originalContainer in list
    for i in [1..originalContainer.count]
      # dirty clone!
      container = JSON.parse JSON.stringify originalContainer
      container.index = i
      container.name += ".#{i}" if container.count > 1
      final.push container

  callback final

validateContainerPresence = (list, done) ->
  iterator = (details, callback) ->
    name = details.name
    container = docker.getContainer name
    container.inspect callback

  async.eachSeries list, iterator, done

isRunning = (container, callback) ->
  container.inspect (err, data) ->
    return callback err if err

    return callback null, data.State.Running
