
// Dependencies
var _ = require("lodash");

// ----------

/**
 * @param {Logger} logger
 */
function Table(logger) {
  this.logger = logger;
  this.rows = {};
  this.rowCount = 0;
  this.maxLength = 0;
  this.esc = "\u001B";
  this.csi = "" + this.esc + "[";
}

// ----------

/**
 * @param {Array} list
 */
Table.prototype.setContainers = function(list) {

  var self = this;
  list.forEach(function(container) {

    // just used for formatting so we pad the container names equally
    var length = container.name.length;
    if(length > self.maxLength) {
      self.maxLength = length;
    }

    self.rows[container.name] = "...";
    self.rowCount += 1;
  });

  return this.renderRows();
}

/**
 * @param {Boolean} clear
 */
Table.prototype.renderRows = function(clear) {

  if(clear == null) {
    clear = false;
  }

  var self = this;
  var str = "";

  if(clear) {
    str += "" + this.csi + this.rowCount + "F";
  }

  _.each(this.rows, function(text, key) {
    str += "" + self.csi + "2K" + (self.padName(key)) + "  " + text + "\n";
  });

  return this.logger.write(str);
}

/**
 * @param {String} name
 * @param {String} message
 */
Table.prototype.render = function(name, message) {
  this.rows[name] = message;
  return this.renderRows(true);
};

/**
 * @param {String} name
 */
Table.prototype.renderOk = function(name) {
  return this.render(name, "" + this.rows[name] + " " + this.csi + "32m✔" + this.csi + "0m");
};

/**
 * @param {String} name
 * @param {String} prefix
 * @param {String} suffix
 */
Table.prototype.padName = function(name, prefix, suffix) {
  prefix = prefix || "";
  suffix = suffix || "";
  var pad = (this.maxLength + 1) - name.length;
  return prefix + name + suffix + (Array(pad).join(" "));
};

// ----------

module.exports = Table;
