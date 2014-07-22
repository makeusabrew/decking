
// Lib
ContainerStream = require("./container_stream");

// ----------

/**
 * @param {Object} container
 * @param {Stream} stream
 * @param {String} name
 */
function MultiplexStream(container, stream, name) {
  this.container = container;
  this.stream = stream;
  this.name = name;
  this.container.modem.demuxStream(this.stream, this.stdout(), this.stderr());
}

MultiplexStream.prototype.stdout = function() {
  return new ContainerStream(this.name, process.stdout);
};

MultiplexStream.prototype.stderr = function() {
  return new ContainerStream(this.name, process.stderr);
};

// ----------

module.exports = MultiplexStream;