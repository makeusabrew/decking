fs            = require "fs"
child_process = require "child_process"
async         = require "async"
uuid          = require "node-uuid"
DepTree       = require "deptree"
read          = require "read"
Docker        = require "dockerode"

MultiplexStream = require "./multiplex_stream"

docker = new Docker socketPath: "/var/run/docker.sock"
logger = process.stdout
log    = (data) -> logger.write "#{data}\n"

module.exports =
class Decking
  constructor: ({@command, @args}) ->
    @config = {}

  processConfig: (config) ->
    for name, details of config.containers
      if typeof details is "string"
        details = config.containers[name] =
          image: details

      details.name = name

      details.dependencies ?= []
      details.aliases = []

      for dependency,i in details.dependencies
        # it's nicer for rest of the app to work with dependencies and alises
        # as separate arrays
        [name, alias] = dependency.split ":"

        alias = name if not alias # if we didn't get dep:alias, assume dep:dep

        details.dependencies[i] = name
        details.aliases[i] = alias

    return config

  parseConfig: (data) -> JSON.parse data

  loadConfig: (file) ->
    #log "Loading package file..."
    @processConfig @parseConfig fs.readFileSync file

  commands:
    help: (done) ->
      log ""
      help =
      """
      Usage: decking COMMAND [arg...]

      Commands:
        build   build an image or pass 'all' to build all
        create   create a cluster
        start    start a cluster of containers
        stop     stop a cluster
        restart  restart a cluster
        status   check the status of a cluster's containers
        attach   attach to all running containers in a cluster
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
    target = getCluster @config, cluster
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
          logAction name, "running" # @TODO more details
        else
          logAction name, "stopped"

        callback null

    # true, we don't care about the order of a cluster,
    # but we *do* care about implicit containers, so we have to run this
    # for now. Should split the methods out
    resolveOrder @config, cluster, (list) -> async.eachLimit list, 5, iterator, done

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
        cmdArgs = ["docker", "run", "-d", "-name", "#{name}"]

        # this starts to get a bit messy; we have to loop over
        # our container's options and using a closure bind a
        # function to run against each key/val - a function which
        # can potentially be asynchronous
        # we bung all these closures in an array which we *then*
        # pass to async. can't just use async.each here as that
        # only works on arrays
        run = []
        for key,val of details
          # don't need to bind 'details', it doesn't change
          do (key, val) ->
            # run is going to be fed into async.series, it expects
            # to only fire a callback per iteration...
            run.push (done) -> getRunArg key, val, details, done

        # now we've got our array of getRunArg calls bound to the right
        # variables, run them in order and add the results to the initial
        # run command
        async.series run, (err, results) ->
          cmdArgs = cmdArgs.concat result for result in results
          cmdArgs.push details.image

          command.exec = cmdArgs.join " "
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

    tarball = "/tmp/decking-#{uuid.v4()}.tar.bz"
    log "Creating tarball to upload context..."

    child_process.exec "tar -cjf #{tarball} ./", ->

      fs.unlink "./Dockerfile", (err) -> log "[WARN] Could not remove Dockerfile" if err

      log "Uploading tarball..."
      docker.buildImage tarball, options, (err, res) ->
        return done err if err

        res.pipe process.stdout

        res.on "end", ->
          log "Cleaning up..."
          fs.unlink tarball, done


  execute: (done) ->
    @command = "help" if not @command or @command is "-h" or @command is "--help"
    fn = @commands[@command]

    throw new Error "Invalid argument" if typeof fn isnt "function"

    @config = @loadConfig "./decking.json" if @command isnt "help"

    return fn.call this, (err) -> throw err if err

maxNameLength = 0

padName = (name, prefix = "", suffix = "") ->
  pad = (maxNameLength + 1) - name.length
  return "#{prefix}#{name}#{suffix}#{Array(pad).join(" ")}"

logAction = (name, message) ->

  log "#{padName(name)}  #{message}"

# @TODO rename; this does more than just order resolution now!
resolveOrder = (config, cluster, callback) ->
  if cluster.group
    # right! specifying a group modifier. let's pump it up...
    groupName = cluster.group
    containers = cluster.containers
    group = config.groups[groupName]
  else
    if cluster.containers
      containers = cluster.containers
    else
      containers = cluster

  containerDetails = {}

  # map container names to actual container definitions
  for containerName in containers
    container = config.containers[containerName]
    containerDetails[containerName] = container

    # some dependencies might not be listed in the cluster but still need
    # to be resolved
    for dependency in container.dependencies
      if not containerDetails[dependency]
        containerDetails[dependency] = config.containers[dependency]

  # rename any containers based on group stuff, calc some max length stuff
  # merge group overrides if present
  for _, container of containerDetails
    container.originalName = container.name
    if groupName
      container.group = groupName
      container.name += ".#{groupName}"

      # first up, completely replace any container config with
      # the group-wide options
      for key, value of group.options
        container[key] = value

      # now check for container specific overrides...
      if group.containers?[container.originalName]?
        for key, value of group.containers[container.originalName]
          # @TODO we're overwriting here, these should MERGE with
          # those specified group-wide... I think. But only if there
          # was a group wide key maybe?
          container[key] = value

    maxNameLength = container.name.length if container.name.length > maxNameLength

  # resolve dependency order
  depTree = new DepTree
  for _, container of containerDetails
    depTree.add container.originalName, container.dependencies

  list = (containerDetails[item] for item in depTree.resolve())

  callback list

validateContainerPresence = (list, done) ->
  iterator = (details, callback) ->
    name = details.name
    container = docker.getContainer name
    container.inspect callback

  async.eachSeries list, iterator, done

getRunArg = (key, val, object, done) ->
  arg = []

  switch key
    when "env"
      # we need to loop through all the entries asynchronously
      # because if we get an ENV_VAR=- format (the key being -) then
      # we'll prompt for the value
      iterator = (v, callback) ->
        [key, value] = v.split "="

        # first thing's first, try and substitute a real process.env value
        if value is "-" then value = process.env[key]

        # did we have one? great! bail early with the updated value
        if value
          arg = [].concat arg, ["-e #{key}=#{value}"]
          return callback null

        # if we got here we still don't have a value for this env var, so
        # we need to ask the user for it
        options =
          prompt: "#{object.name} requires a value for the env var '#{key}':"
          silent: true
          replace: "*"

        read options, (err, value) ->
          arg = [].concat arg, ["-e #{key}=#{value}"]
          return callback null

      return async.eachSeries val, iterator, (err) -> done err, arg

    when "dependencies"
      for v,k in val
        if object.group
          v += ".#{object.group}"
        # we trust that the aliases array has the correct matching
        # indices here such that alias[k] is the correct alias for dependencies[k]
        alias = object.aliases[k]
        arg = [].concat arg, ["-link #{v}:#{alias}"]

    when "port"
      arg = [].concat arg, ["-p #{v}"] for v in val

    when "privileged"
      arg = ["-privileged"] if val

    when "mount"
      for v in val
        [host, remote] = v.split ":"
        host = process.cwd() if host is "."
        arg = [].concat arg, ["-v #{host}:#{remote}"]

  return done null, arg

getCluster = (config, cluster) ->
  if not cluster
    throw new Error "Please supply a cluster name" if Object.keys(config.clusters).length isnt 1

    # no cluster specified, but there's only one, so just default to it
    cluster = key for key of config.clusters
    log "Defaulting to cluster '#{cluster}'"

  target = config.clusters[cluster]

  throw new Error "Cluster #{cluster} does not exist in decking.json"  if not target

  if target.group
    log "Using overrides from group '#{target.group}'\n"

  return target

isRunning = (container, callback) ->
  container.inspect (err, data) ->
    return callback err if err

    return callback null, data.State.Running
