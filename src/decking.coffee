fs            = require "fs"
child_process = require "child_process"
async         = require "async"
uuid          = require "node-uuid"
DepTree       = require "deptree"

Docker = require "dockerode"
docker = new Docker
  socketPath: "/var/run/docker.sock"

logger = process.stdout
log = (data) -> logger.write "#{data}\n"

class Decking
  constructor: (options) ->
    {@command, @args} = options

    @config = @loadConfig "./decking.json"

  processConfig: (config) ->
    for name, details of config.containers
      if typeof details is "string"
        details = config.containers[name] =
          image: details

      details.dependencies = [] if not details.dependencies
      details.aliases = []
      details.name = name
      for dependency,i in details.dependencies
        [name, alias] = dependency.split ":"
        details.dependencies[i] = name
        details.aliases[i] = alias

    return config

  parseConfig: (data) -> JSON.parse data

  loadConfig: (file) ->
    log "Loading package file..."
    @processConfig @parseConfig fs.readFileSync file

  commands:
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

    create: (done) ->
      # create a container based on metadata
      # for now due to remote API limitations this
      # is going to be a `run` followed quickly by a `stop`
      [container] = @args
      @create container, done

    start: (done) ->
      [cluster] = @args
      @start cluster, done

    stop: (done) ->
      [cluster] = @args
      @stop cluster, done

    status: (done) ->
      child_process.exec "docker ps", (err, stdout, stderr) ->
        process.stdout.write stdout
        done()

  start: (cluster, done) ->
    throw new Error "Please supply a cluster to start" if not cluster

    target = @config.clusters[cluster]

    throw new Error "Cluster #{cluster} does not exist in decking.json"  if not target

    log "Resolving dependencies for cluster #{cluster}"

    resolveOrder @config, target, (list) ->

      validateContainerPresence list, (err) ->
        return done err if err

        async.eachSeries list, (details, callback) ->
          name = details.name
          container = docker.getContainer name
          container.inspect (err, data) ->
            if not data.State.Running
              log "Starting container #{name}"
              container.start callback
            else
              log "Container #{name} already running..."
              callback null
        , done


  stop: (cluster, done) ->
    throw new Error "Please supply a cluster to stop" if not cluster

    target = @config.clusters[cluster]

    throw new Error "Cluster #{cluster} does not exist in decking.json"  if not target

    resolveOrder @config, target, (list) ->

      validateContainerPresence list, (err) ->
        return done err if err

        async.eachSeries list, (details, callback) ->
          name = details.name
          container = docker.getContainer name
          container.inspect (err, data) ->
            if data.State.Running
              log "Stopping container #{name}"
              container.stop callback
            else
              log "Container #{name} is not running..."
              callback null
        , done

  create: (container, done) ->
    # @TODO use the remote API when it supports -name and -link
    # @TODO check the target image exists locally, otherwise
    # `docker run` will try to download it. we want to take care
    # of dependency resolution ourselves
    throw new Error("Please supply a container to create") if not container

    target = @config.containers[container]

    throw new Error("Container #{container} does not exist in decking.json") if not target

    cmdArgs = ["docker", "run", "-d", "-name", "#{container}"]
    cmdArgs = [].concat cmdArgs, @getRunArg key, val for key,val of target

    doRun = ->
      cmdArgs.push target.image
      log "Creating container #{container}"

      child_process.exec cmdArgs.join(" "), (err) ->
        # @TODO handle err properly
        setTimeout ->
          child_process.exec "docker stop #{container}", done
        , 500

    depLength = target.dependencies?.length || 0

    return doRun() if not depLength

    for dependency in target.dependencies
      [container, alias] = dependency.split ":"
      log "Creating dependency #{container}"
      cmdArgs.push "-link"
      cmdArgs.push dependency
      do =>
        @create container, ->
          depLength -= 1
          if depLength is 0
            doRun()

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

        res.pipe process.stdout

        res.on "end", ->
          log "Cleaning up..."
          fs.unlink tarball, done


  getRunArg: (key, val) ->
    arg = []
    switch key
      when "port"
        arg = ["-p", "#{val[0]}"]
      when "env"
        for k,v of val
          if v is "-" then v = process.env[k]
          arg = [].concat arg, ["-e", "#{k}=#{v}"]

    return arg

  execute: (done) ->
    fn = @commands[@command]

    throw new Error("Invalid arg") if typeof fn isnt "function"

    return fn.call this, (err) -> throw err if err

module.exports = Decking

resolveOrder = (config, cluster, callback) ->
  containerDetails = {}

  for containerName in cluster
    container = config.containers[containerName]
    containerDetails[containerName] = container

    # some dependencies might not be listed in the cluster but still need
    # to be resolved
    for dependency in container.dependencies
      if not containerDetails[dependency]
        containerDetails[dependency] = config.containers[dependency]

  depTree = new DepTree
  depTree.add name, details.dependencies for name, details of containerDetails

  list = (containerDetails[item] for item in depTree.resolve())

  callback list

validateContainerPresence = (list, done) ->
  iterator = (details, callback) ->
    name = details.name
    container = docker.getContainer name
    container.inspect callback

  async.eachSeries list, iterator, done
