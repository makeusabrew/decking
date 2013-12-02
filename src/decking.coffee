fs = require "fs"
child_process = require "child_process"
async = require "async"

Docker = require "dockerode"
docker = new Docker
  socketPath: "/var/run/docker.sock"

class Decking
  constructor: (options) ->
    @logger = process.stdout
    {@command, @args} = options

    @config = @loadConfig "./decking.json"

  parseConfig: (data) -> JSON.parse data

  loadConfig: (file) ->
    @log "Loading package file..."
    @parseConfig fs.readFileSync file

  log: (data) -> @logger.write "#{data}\n"

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
      [container] = @args
      @start container, done

    stop: (done) ->
      [container] = @args
      @stop container, done

    cluster: (done) ->
      [method, cluster] = @args
      switch method
        when "start" then @cluster_start cluster, done
        when "stop" then @cluster_stop cluster, done

    status: (done) ->
      child_process.exec "docker ps", (err, stdout, stderr) ->
        process.stdout.write stdout
        done()

  start: (container, done) ->
    throw new Error("Please supply a container to start") if not container

    target = @config.containers[container]

    throw new Error("Container #{container} does not exist in decking.json") if not target

    container = docker.getContainer container
    container.start done

  stop: (container, done) ->
    throw new Error("Please supply a container to stop") if not container

    target = @config.containers[container]

    throw new Error("Container #{container} does not exist in decking.json") if not target

    container = docker.getContainer container
    container.stop done

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

    doRun = =>
      cmdArgs.push target.image

      child_process.exec cmdArgs.join(" "), ->
        setTimeout ->
          child_process.exec "docker stop #{container}", done
        , 500

    depLength = target.dependencies?.length || 0

    return doRun() if not depLength

    for dependency in target.dependencies
      [container, alias] = dependency.split ":"
      @log "Creating dependency #{container}"
      cmdArgs.push "-link"
      cmdArgs.push dependency
      do =>
        @create container, =>
          depLength -= 1
          if depLength is 0
            doRun()

  cluster_start: (cluster, done) ->
    throw new Error("Please supply a cluster to start") if not cluster

    target = @config.clusters[cluster]

    throw new Error("Cluster #{cluster} does not exist in decking.json") if not target

    # @TODO get this in dependency order
    async.eachSeries target, (container, callback) =>
      @start container, callback
    , done

  cluster_stop: (cluster, done) ->
    throw new Error("Please supply a cluster to stop") if not cluster

    target = @config.clusters[cluster]

    throw new Error("Cluster #{cluster} does not exist in decking.json") if not target

    async.eachSeries target, (container, callback) =>
      @stop container, callback
    , done

  build: (image, done) ->

    throw new Error("Please supply an image name to build") if not image

    @log "Looking up build data for #{image}"

    target = @config.images[image]

    throw new Error("Image #{image} does not exist in decking.json") if not target

    targetPath = "#{target}/Dockerfile"

    @log "Building image #{image} from #{targetPath}"
    @log ""

    # @TODO for now, always assume we want to build from a Dockerfile
    # @TODO need a lot of careful validation here
    fs.createReadStream(targetPath).pipe fs.createWriteStream("./Dockerfile")

    options =
      t: image

    child_process.exec "tar -cjf /tmp/test.tar.bz2 ./", ->
      fs.unlinkSync "./Dockerfile"
      docker.buildImage "/tmp/test.tar.bz2", options, (err, res) ->
        res.pipe process.stdout
        res.on "end", =>
          # @TODO remove tarball
          done()


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

    return fn.call this, (err) => throw err if err

    ###
    @prepare (err) =>

      return @cleanup() if err

      fn.call this, (err) => @cleanup()
   ###

module.exports = Decking
