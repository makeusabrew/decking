util = require "util"
Writable = require("stream").Writable

ContainerStream = (@name, @dest) ->
  Writable.call this

util.inherits ContainerStream, Writable

ContainerStream::_write = (chunk, encoding, next) ->
  # because we don't set decodeStrings = true, we know
  # chunk will *always* be a buffer and can ignore encoding
  # which means we're safe to toString it
  data = chunk.toString "utf8"
  # @TODO we only want to prefix the name when this is a new message
  # e.g. not a continuation of an already started line.
  data = "#{@name} #{data}"
  @dest.write data

  next()

module.exports = ContainerStream
