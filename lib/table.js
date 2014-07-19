var Logger, Table, csi, esc, maxLength, rowCount, rows;

Logger = require("./logger");

rows = {};

rowCount = 0;

maxLength = 0;

esc = "\u001B";

csi = "" + esc + "[";

Table = {
  setContainers: function(list) {
    var container, length, _i, _len;
    for (_i = 0, _len = list.length; _i < _len; _i++) {
      container = list[_i];
      length = container.name.length;
      if (length > maxLength) {
        maxLength = length;
      }
      rows[container.name] = "...";
      rowCount += 1;
    }
    return Table.renderRows();
  },
  renderRows: function(clear) {
    var key, str, text;
    if (clear == null) {
      clear = false;
    }
    str = "";
    if (clear) {
      str += "" + csi + rowCount + "F";
    }
    for (key in rows) {
      text = rows[key];
      str += "" + csi + "2K" + (Table.padName(key)) + "  " + text + "\n";
    }
    return Logger.write(str);
  },
  render: function(name, message) {
    rows[name] = message;
    return Table.renderRows(true);
  },
  renderOk: function(name) {
    return Table.render(name, "" + rows[name] + " " + csi + "32m✔" + csi + "0m");
  },
  padName: function(name, prefix, suffix) {
    var pad;
    if (prefix == null) {
      prefix = "";
    }
    if (suffix == null) {
      suffix = "";
    }
    pad = (maxLength + 1) - name.length;
    return "" + prefix + name + suffix + (Array(pad).join(" "));
  }
};

module.exports = Table;
