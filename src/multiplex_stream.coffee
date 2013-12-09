ContainerStream = require "./container_stream"

module.exports =
class DupliexStream
  constructor: (@container, @stream, @name) ->
    @container.modem.demuxStream @stream, @stdout(), @stderr()

  stdout: -> new ContainerStream @name, process.stdout
  stderr: -> new ContainerStream @name, process.stderr
