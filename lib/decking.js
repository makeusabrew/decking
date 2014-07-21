var Cluster, Decking, Docker, JSONStream, Logger, MultiplexStream, Parser, Runner, Table, async, child_process, docker, fs, host, isRunning, log, logStream, resolveContainers, validateContainerPresence, version;

// Dependencies
var _ = require("lodash");
var async = require("async");
var child_process = require("child_process");
var Docker = require("dockerode");
var fs = require("fs");
var JSONStream = require("JSONStream");
var util = require("util");

// Lib
var Cluster = require("./cluster");
var Logger = require("./logger");
var MultiplexStream = require("./multiplex_stream");
var Parser = require("./parser");
var Runner = require("./runner");
var Table = require("./table");

// ----------

var host = process.env.DOCKER_HOST || "/var/run/docker.sock";
var docker = new Docker({'socketPath': host});
var log = Logger.log;
var version = require("" + __dirname + "/../package.json").version;

function logStream(name, data) {
  return log("" + (Table.padName(name, "(", ")")) + " " + data);
};

function resolveContainers(config, cluster, callback) {
  return Cluster.resolveContainers(config, cluster, function(list) {
    Table.setContainers(list);
    return callback(list);
  });
};

function validateContainerPresence(list, done) {
  var iterator;
  iterator = function(details, callback) {
    var container, name;
    name = details.name;
    container = docker.getContainer(name);
    return container.inspect(callback);
  };
  return async.eachSeries(list, iterator, done);
};

function isRunning(container, callback) {
  return container.inspect(function(err, data) {
    if(err) {
      return callback(err);
    }
    return callback(null, data.State.Running);
  });
};

// ----------

function Decking(options) {
  this.command = options ? options.command : undefined;
  this.args = options && options.args ? options.args : [];
  this.config = {};
}

Decking.prototype.parseConfig = function(data) {
  return JSON.parse(data);
};

Decking.prototype.loadConfig = function(file) {
  return Parser.load(this.parseConfig(fs.readFileSync(file)));
};

// @TODO: Feel like we can do this a bit better. Move help and build to first
// class functions and have an array of actions that can be performed.
Decking.prototype.commands = {
  help: function(done) {
    log("\n" +
      "Usage: decking COMMAND [arg...]\n\n" +
      "Commands:\n" +
      "    build      build an image or pass 'all' to build all\n" +
      "    create     create a cluster of containers\n" +
      "    start      start a cluster\n" +
      "    stop       stop a cluster\n" +
      "    restart    restart a cluster\n" +
      "    status     check the status of a cluster's containers\n" +
      "    attach     attach to all running containers in a cluster\n\n" +
      "Version: " + version + "\n");
    return done(null);
  },
  build: function(done) {
    var image = this.args[0];
    if(image === "all") {
      var images = Object.keys(this.config.images);
      var self = this;
      return async.each(images, function(image, callback) {
        return self.build(image, callback);
      });
    } else {
      return this.build(image, done);
    }
  },
  create: function(done) {
    return this._run("create", done);
  },
  start: function(done) {
    return this._run("start", done);
  },
  stop: function(done) {
    return this._run("stop", done);
  },
  restart: function(done) {
    return this._run("restart", done);
  },
  status: function(done) {
    return this._run("status", done);
  },
  attach: function(done) {
    return this._run("attach", done);
  }
};

Decking.prototype._run = function(cmd, done) {
  var key;
  var cluster = this.args[0];
  if(!cluster) {
    if(Object.keys(this.config.clusters).length != 1) {
      throw new Error("Please supply a cluster name");
    }
    cluster = Object.keys(this.config.clusters).pop();
    log("Defaulting to cluster '" + cluster + "'");
  }
  var target = this.config.clusters[cluster];
  if(!target) {
    throw new Error("Cluster " + cluster + " does not exist in decking.json");
  }
  if(target.group) {
    log("Using overrides from group '" + target.group + "'\n");
  }
  return this[cmd](target, done);
};

Decking.prototype.start = function(cluster, done) {
  var self = this;
  return resolveContainers(this.config, cluster, function(list) {
    return validateContainerPresence(list, function(err) {
      if(err) return done(err);
      return async.eachSeries(list, self._startIterator, done);
    });
  });
};

Decking.prototype._startIterator = function(details, callback) {
  var name = details.name;
  var container = docker.getContainer(name);
  return isRunning(container, function(err, running) {
    if(!running) {
      Table.render(name, "starting...");
      return container.start(function(err) {
        if(err) return callback(err);
        Table.renderOk(name);
        return callback();
      });
    }
    Table.render(name, "already running");
    return callback();
  });
};

Decking.prototype.stop = function(cluster, done) {
  var self = this;
  return resolveContainers(this.config, cluster, function(list) {
    return validateContainerPresence(list, function(err) {
      if(err) return done(err);
      return async.eachSeries(list, self._stopIterator, done);
    });
  });
};

Decking.prototype._stopIterator = function(details, callback) {
  var name = details.name;
  var container = docker.getContainer(name);
  return isRunning(container, function(err, running) {
    if(running) {
      Table.render(name, "stopping...");
      return container.stop({t: 5}, function(err) {
        if(err) return callback(err);
        Table.renderOk(name);
        return callback(null);
      });
    }
    Table.render(name, "already stopped");
    return callback(null);
  });
};

Decking.prototype.restart = function(cluster, done) {
  var self = this;
  return resolveContainers(this.config, cluster, function(list) {
    return validateContainerPresence(list, function(err) {
      if(err) return done(err);
      return async.eachSeries(list, self._restartIterator, done);
    });
  });
};

Decking.prototype._restartIterator = function(details, callback) {
  var name = details.name;
  var container = docker.getContainer(name);
  return isRunning(container, function(err, running) {
    if(running) {
      Table.render(name, "restarting...");
      return container.stop({t: 5}, function(err) {
        if(err) return callback(err);
        return container.start(function(err) {
          if(err) return callback(err);
          Table.renderOk(name);
          return callback(null);
        });
      });
    }
    Table.render(name, "starting...");
    return container.start(function(err) {
      if(err) return callback(err);
      Table.renderOk(name);
      return callback(null);
    });
  });
};

Decking.prototype.attach = function(cluster, done) {
  var self = this;
  return resolveContainers(this.config, cluster, function(list) {
    return validateContainerPresence(list, function(err) {
      if(err) return done(err);
      return async.eachSeries(
        list,
        function(details, callback) {
          var container = docker.getContainer(details.name);
          return self._attachIterator(details.name, container, true, callback);
        },
        done
      );
    });
  });
};

Decking.prototype._attachIterator = function(name, container, fetchLogs, callback) {
  var self = this;
  var options = {
    stream: true,
    stdout: true,
    stderr: true,
    tty: false,
    logs: fetchLogs
  };
  return container.attach(options, function(err, stream) {
    new MultiplexStream(container, stream, Table.padName(name, "(", ")"));
    stream.on("end", function() {
      logStream(name, "gone away, will try to re-attach for two minutes...");
      return self._reAttach(name, container);
    });
    return typeof callback === "function" ? callback(err) : void 0;
  });
};

Decking.prototype._reAttach = function(name, container, attempts) {
  attempts = attempts || 0;
  return setTimeout(function() {
    return isRunning(container, function(err, running) {
      if(running) {
        return attach(name, container, false, function() {
          return logStream(name, "re-attached");
        });
      } else {
        if(attempts < 200) {
          return reAttach(name, container, attempts + 1);
        } else {
          return logStream(name, "max re-attach attempts reached, bailing...");
        }
      }
    });
  }, 600);
};

Decking.prototype.status = function(cluster, done) {
  var self = this;
  return resolveContainers(this.config, cluster, function(list) {
    return async.eachLimit(list, 3, self._statusIterator, done);
  });
};

Decking.prototype._statusIterator = function(details, callback) {
    var name = details.name;
    var container = docker.getContainer(name);
    return container.inspect(function(err, data) {
      if(err) {
        Table.render(name, "does not exist");
      } else if(data.State.Running) {
        var str = "running  " + data.NetworkSettings.IPAddress;
        _.each(data.NetworkSettings.Ports, function(host, local) {
          host = host ? host[0] : null;
          str += "  ";
          if(host) {
            str += host.HostIp + ":" + host.HostPort + "->";
          }
          str += local;
        });
        Table.render(name, str);
      } else {
        Table.render(name, "stopped");
      }
      return callback(null);
    });
  }

Decking.prototype.create = function(cluster, done) {
  var self = this;
  return Cluster.resolveContainers(this.config, cluster, function(list) {
    return async.mapSeries(list, self._fetchIterator, function(err, commands) {
      if(err) throw err;
      Table.setContainers(list);
      return async.eachSeries(commands, self._createIterator, function(err) {
        if(err) throw err;
        return setTimeout(function() {
          return async.eachLimit(list, 5, self._stopIteratorIterator, done);
        }, 1000);
      });
    });
  });
};

Decking.prototype._fetchIterator = function(details, callback) {
  var name = details.name;
  var container = docker.getContainer(name);
  var command = {
    name: name,
    container: container
  };
  return container.inspect(function(err, data) {
    if(!err) {
      command.exists = true;
      return callback(null, command);
    }
    var run = [];
    var sortedArgs = Runner.sortArgs(details.object);
    _.each(sortedArgs, function(val, key) {
      return run.push(function(done) {
        return Runner.getArg(key, val, details, done);
      });
    });
    return async.series(run, function(err, results) {
      if(err) throw err;
      command.exec = Runner.formatArgs(name, results);
      return callback(null, command);
    });
  });
};

Decking.prototype._createIterator = function(command, callback) {
  var name = command.name;
  if(command.exists) {
    Table.render(name, "already exists - running in case of dependents");
    return isRunning(command.container, function(err, running) {
      if(!running) {
        return command.container.start(callback);
      }
      return command.container.stop({t: 5}, function(err) {
        return command.container.start(callback);
      });
    });
  }
  Table.render(name, "creating...");
  return child_process.exec(command.exec, function(err) {
    if(err) return callback(err);
    Table.renderOk(name);
    return callback(null);
  });
};

Decking.prototype._stopIteratorIterator = function(details, callback) {
  var container = docker.getContainer(details.name);
  return container.stop({t: 5}, callback);
};

Decking.prototype.build = function(image, done) {

  if(!image) {
    throw new Error("Please supply an image name to build");
  }

  log("Looking up build data for " + image);

  var target = this.config.images[image];
  if(!target) {
    throw new Error("Image " + image + " does not exist in decking.json");
  }

  var targetPath = target + "/Dockerfile";
  log("Building image " + image + " from " + targetPath);

  var readStream = fs.createReadStream(targetPath);
  var writeStream = fs.createWriteStream("./Dockerfile");
  var self = this;
  writeStream.on("close", function() {
    var options = {t: image};
    if(self.hasArg("--no-cache")) {
      log("Not using image cache");
      options.nocache = true;
    }

    log("Uploading compressed context...");
    var tar = child_process.spawn("tar", ["-c", "-", "./"]);

    return docker.buildImage(tar.stdout, options, function(err, res) {
      fs.unlink("./Dockerfile", function(err) {
        if(err) return log("[WARN] Could not remove Dockerfile");
      });
      if(err) return done(err);
      if(res.headers["content-type"] === "application/json") {
        res.pipe(JSONStream.parse("stream")).pipe(process.stdout);
      } else {
        res.pipe(process.stdout);
      }
      return res.on("end", done);
    });
  });

  readStream.pipe(writeStream);
};

Decking.prototype.execute = function(done) {
  if(!this.command || this.command == "-h" || this.command == "--help") {
    this.command = "help";
  }
  var fn = this.commands[this.command];
  if(typeof fn !== "function") {
    throw new Error("Unknown method " + this.command);
  }
  if(this.command != "help") {
    this.config = this.loadConfig("./decking.json");
  }
  return fn.call(this, function(err) {
    if(err) throw err;
  });
};

Decking.prototype.hasArg = function(arg) {
  return this.args.indexOf(arg) !== -1;
};

module.exports = Decking;