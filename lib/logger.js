var Logger, logger;

logger = process.stdout;

Logger = {
  log: function(data) {
    return logger.write("" + data + "\n");
  },
  write: function(data) {
    return logger.write(data);
  }
};

module.exports = Logger;
