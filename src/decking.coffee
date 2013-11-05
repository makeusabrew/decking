fs = require "fs"
child_process = require "child_process"

class Decking
  constructor: (@args) ->

  build: ->
    source  = @args[3]
    ###
    image   = process.argv[3]
    context = process.argv[4] || process.cwd()
    ###
    context = process.cwd()
    path    = context + "/Dockerfile"

    fs.symlinkSync source, path

    buffer = fs.readFileSync path
    str = buffer.toString "utf8"

    [head, tail...] = str.split "\n"

    matches = head.match /build as (.+)$/

    throw "No valid meta line found" if not matches

    image = matches[1]
    console.log "Building docker image #{image}...\n"

    db = child_process.spawn "docker", ["build", "-t", image, context]

    db.stdout.on "data", (d) -> process.stdout.write d
    db.stderr.on "data", (d) -> process.stderr.write d

    db.on "exit", (code) ->
      fs.unlinkSync path

  status: ->
    child_process.exec "docker ps", (err, stdout, stderr) ->
      process.stdout.write stdout

module.exports = Decking
