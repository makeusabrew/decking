
// Dependencies
var _ = require("lodash");

// ----------

/**
 * @param {Logger} logger
 */
function Table(logger) {
  this.tty = process.stdout.isTTY;
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

  return this.renderRows(false);
};

/**
 * @param {Boolean} clear
 * @param {Boolean} isFinal
 */
Table.prototype.renderRows = function(clear, isFinal) {

  var self = this;
  var str = "";

  if (this.tty && clear) {
    str += "" + this.csi + this.rowCount + "F";
  }

  _.each(this.rows, function(text, key) {
    str += self.renderRow(text, key);
  });

  if (this.tty || isFinal) {
    this.logger.write(str);
  }
};

Table.prototype.renderRow = function(text, key) {
  var str = "";
  if (this.tty) {
    str += this.csi + "2K";
  }
  str += (this.padName(key)) + "  " + text + "\n";
  return str;
};

/**
 * @param {String} name
 * @param {String} message
 * @param {String} isFinal
 */
Table.prototype.render = function(name, message, isFinal) {
  this.rows[name] = message;

  if (this.tty) {
    this.renderRows(true, isFinal);
  } else if (isFinal) {
    this.logger.write(this.renderRow(message, name));
  }
};

Table.prototype.renderFinal = function(name, message) {
  this.render(name, message, true);
};

/**
 * @param {String} name
 */
Table.prototype.renderOk = function(name) {
  return this.renderFinal(
    name, "" + this.rows[name] + " " + this.csi + "32m✔" + this.csi + "0m"
  );
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
