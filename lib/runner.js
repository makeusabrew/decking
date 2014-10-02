
// Dependencies
var async = require("async");
var read = require("read");
var path = require("path");

// ----------

function Runner() {}

// ----------

Runner.prototype.getArg = function(key, val, container, done) {

  var arg = [];

  switch(key) {

    case "env":
      // we need to loop through all the entries asynchronously
      // because if we get an ENV_VAR=- format (the key being -) then
      // we'll prompt for the value
      return async.reduce(val, [], this._envIterator.bind(this, container),
        function(err, arg) {
          return done(err, arg);
        }
      );
      break;

    case "dependencies":
      arg = val.map(function(v, k) {
        if(container.group) {
          v += "." + container.group;
        }
        // we trust that the aliases array has the correct matching indices
        // here such that alias[k] is the correct alias for dependencies[k]
        var alias = container.object.aliases[k];
        return "--link " + v + ":" + alias;
      });
      break;

    case "port":
      arg = val.map(function(v) {
        return "-p " + v;
      });
      break;

    case "privileged":
      if(val) {
        arg = ["-privileged"];
      }
      break;

    case "mount":
      arg = val.map(function(v) {

        var parts = v.split(":");

        if (parts.length === 1) {
          // not a host:remote path, bail early
          return "-v " + v;
        }

        var host = parts[0];
        var remote = parts[1];

        var matches = host.match(/^\.(.*)$/);
        if(matches) {
          host = path.join(process.cwd(), matches[1]);
        }
        if(host == ".") {
          host = process.cwd();
        }

        return "-v " + host + ":" + remote;
      });
      break;

    case "mount-from":
      arg = val.map(function(v) {
        if(container.group) {
          v += "." + container.group;
        }
        return "--volumes-from " + v;
      });
      break;

    case "host":
      arg = ["-h "+val];
      break;

    case "image":
    case "extra":
      arg = [val];
      break;

    default:
      return done(new Error("Unknown argument " + key));
  }

  return done(null, arg);
};

Runner.prototype._envIterator = function(container, memo, item, callback) {

  var parts = item.split("=");
  var key = parts[0];
  var value = parts[1];

  // first thing's first, try and substitute a real process.env value
  if(value == "-") {
    value = process.env[key];
  }

  // did we have one? great! bail early with the updated value
  if(value) {
    memo.push( "-e " + key + "=" + value);
    return callback(null, memo);
  }

  // if we got here we still don't have a value for this env var, so
  // we need to ask the user for it
  var options = {
    prompt: container.name + " requires a value for the env var '" + key + "':",
    silent: true,
    replace: "*"
  };
  return read(options, function(err, value) {
    memo.push( "-e " + key + "=" + value);
    return callback(err, memo);
  });
};

Runner.prototype.argsOrder = [
  "env",
  "dependencies",
  "port",
  "privileged",
  "mount",
  "mount-from",
  "host",
  "image",
  "extra"
];

Runner.prototype.sortArgs = function(object) {
  var sorted = {};
  this.argsOrder.forEach(function(key) {
    if(object[key]) {
      sorted[key] = object[key];
    }
  });
  return sorted;
};

Runner.prototype.formatArgs = function(name, args) {
  var cmdArgs = ["docker", "run", "-d", "--name", "" + name];
  cmdArgs = Array.prototype.concat.apply(cmdArgs, args);
  return cmdArgs.join(" ");
};

// ----------

module.exports = new Runner();
