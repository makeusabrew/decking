var ContainerStream, Writable, util;

util = require("util");

Writable = require("stream").Writable;

ContainerStream = function(name, dest) {
  this.name = name;
  this.dest = dest;
  return Writable.call(this);
};

util.inherits(ContainerStream, Writable);

ContainerStream.prototype._write = function(chunk, encoding, next) {
  var data;
  data = chunk.toString("utf8");
  data = "" + this.name + " " + data;
  this.dest.write(data);
  return next();
};

module.exports = ContainerStream;
