
function Logger() {
  this.logger = process.stdout;
}

// ----------

Logger.prototype.log = function(data) {
    return this.logger.write("" + data + "\n");
}

Logger.prototype.write = function(data) {
    return this.logger.write(data);
}

// ----------

module.exports = Logger;