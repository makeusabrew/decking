fs = require "fs"
child_process = require "child_process"

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
    @log "Loading metadata..."
    @parseConfig fs.readFileSync file

  log: (data) -> @logger.write "#{data}\n"

  build: (done) ->
    [image] = @args

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

  status: (done) ->
    child_process.exec "docker ps", (err, stdout, stderr) ->
      process.stdout.write stdout
      done()

  run: (done) ->
    args = @commands.run.split " "

    dr = child_process.spawn "docker", args.slice 1

    dr.stdout.on "data", (d) -> process.stdout.write d
    dr.stderr.on "data", (d) -> process.stderr.write d

    dr.on "exit", (code) -> done()


  execute: (done) ->
    fn = this[@command]

    throw new Error("Invalid arg") if typeof fn isnt "function"

    return fn.call this, (err) =>

    ###
    @prepare (err) =>

      return @cleanup() if err

      fn.call this, (err) => @cleanup()
   ###

module.exports = Decking
