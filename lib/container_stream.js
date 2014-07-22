
// Dependencies
var util = require("util");
var Writable = require("stream").Writable;

// ----------

/**
 * @param {String} name
 * @param {Object} dest
 */
function ContainerStream(name, dest) {
  this.name = name;
  this.dest = dest;
  return Writable.call(this);
};

util.inherits(ContainerStream, Writable);

// ----------

/**
 * @param {Buffer} chunk
 * @param {string} encoding
 * @param {Function} next
 */
ContainerStream.prototype._write = function(chunk, encoding, next) {

  // because we don't set decodeStrings = true, we know
  // chunk will *always* be a buffer and can ignore encoding
  // which means we're safe to toString it
  var data = chunk.toString("utf8");

  // @TODO we only want to prefix the name when this is a new message
  // e.g. not a continuation of an already started line.
  data = this.name + " " + data;
  this.dest.write(data);
  return next();
};

// ----------

module.exports = ContainerStream;
