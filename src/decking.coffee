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

    run: (done) ->
      # @TODO use the remote API when it supports -name and -link
      # @TODO check the target image exists locally, otherwise
      # `docker run` will try to download it. we want to take care
      # of dependency resolution ourselves
      [container] = @args
      @run container, done

    status: (done) ->
      child_process.exec "docker ps", (err, stdout, stderr) ->
        process.stdout.write stdout
        done()

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

  run: (container, done) ->

    throw new Error("Please supply a container to run") if not container

    target = @config.containers[container]

    throw new Error("Container #{container} does not exist in decking.json") if not target

    cmdArgs = ["run", "-d", "-name", "#{container}"]
    cmdArgs = [].concat cmdArgs, @getRunArg key, val for key,val of target

    doRun = =>
      cmdArgs.push target.image

      stream = child_process.spawn "docker", cmdArgs
      stream.stdout.pipe process.stdout
      stream.stderr.pipe process.stderr
      stream.on "exit", done

    depLength = target.dependencies?.length || 0

    if depLength
      for dependency in target.dependencies
        [container, alias] = dependency.split ":"
        @log "Resolving dependency on #{container}"
        cmdArgs.push "-link"
        cmdArgs.push dependency
        do =>
          @_run container, =>
            depLength -= 1
            if depLength is 0
              doRun()
    else
      doRun()

  getRunArg: (key, val) ->
    arg = []
    switch key
      when "port"
        arg = ["-p", "#{val[0]}"]
      when "env"
        arg = [].concat arg, ["-e", "#{k}=#{v}"] for k,v of val

    return arg

  execute: (done) ->
    fn = @commands[@command]

    throw new Error("Invalid arg") if typeof fn isnt "function"

    return fn.call this, (err) => console.log "DONE", "ERR?", err

    ###
    @prepare (err) =>

      return @cleanup() if err

      fn.call this, (err) => @cleanup()
   ###

module.exports = Decking
