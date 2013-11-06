fs = require "fs"
child_process = require "child_process"


class Decking
  # @TODO get rid of args, should be options by the time they get here?
  constructor: (args) ->
    @mode = "dev" # @TODO from args
    @source  = args[3]
    @context = process.cwd()
    @path    = @context + "/Dockerfile"

  prepare: (done) ->
    # @TODO deal with pre-existing file, make async
    fs.symlinkSync @source, @path

    buffer = fs.readFileSync @path
    # @TODO handle read error, make async
    buffer = buffer.toString "utf8"

    lines = buffer.split "\n"

    @commands =
      run: ""
      build: ""

    for line in lines
      matches = line.match /^#\s+decking:\s+(build|run)(\((\w+)\))?\s+as\s+(.+)$/
      if matches
        [_, cmd, _, mode, args] = matches
        if !mode or mode is @mode
          @commands[cmd] = args

    if lines.length
      done()
    else
      done "No meta data found"

  cleanup: ->
    fs.unlinkSync @path

  build: (done) ->

    return done "No image specified" if !@commands.build

    image = @commands.build

    console.log "Building docker image #{image}...\n"

    db = child_process.spawn "docker", ["build", "-t", image, @context]

    db.stdout.on "data", (d) -> process.stdout.write d
    db.stderr.on "data", (d) -> process.stderr.write d

    db.on "exit", (code) -> done()

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

module.exports = Decking
