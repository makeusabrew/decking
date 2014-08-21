
// Dependencies
var _ = require("lodash");
var async = require("async");
var child_process = require("child_process");
var Docker = require("dockerode");
var fs = require("fs");
var JSONStream = require("JSONStream");
var util = require("util");
var YAML = require('js-yaml');

// Lib
var Cluster = require("./cluster");
var Logger = require("./logger");
var MultiplexStream = require("./multiplex_stream");
var Parser = require("./parser");
var Runner = require("./runner");
var Table = require("./table");

// ----------

/**
 * @param {Object} options { command: "", args: [] }
 */
function Decking(options) {

  this.command = options ? options.command : undefined;
  this.args = options && options.args ? options.args : [];
  this.config = {};

  this.dockerHost = process.env.DOCKER_HOST || "/var/run/docker.sock";
  this.docker = new Docker({'socketPath': this.dockerHost});
  this.logger = new Logger();
  this.table = new Table(this.logger);
}

/**
 * @param {Function} done
 *
 * @throws {Error}
 */
Decking.prototype.execute = function(done) {

  if(!this.command || this.command == "-h" || this.command == "--help") {
    this.command = "help";
  }

  var fn = this.commands[this.command];
  if(typeof fn != "function") {
    throw new Error("Unknown method " + this.command);
  }

  if(this.command != "help") {
    this.config = this.loadConfig();
  }

  return fn.call(this, function(err) {
    if(err) throw err;
  });
};

/**
 * @param {String} file
 *
 * @return {String}
 */
Decking.prototype.loadConfig = function() {
  // Check for existance
  var yamlConfig = fs.existsSync("./decking.yaml");
  var jsonConfig = fs.existsSync("./decking.json");

  var config = null;
  if (yamlConfig && jsonConfig) {
    throw new Error("Both decking.json and decking.yaml have been found. Please remove one.");
  } else if (yamlConfig){
    config = YAML.safeLoad(fs.readFileSync("./decking.yaml"));
  } else if (jsonConfig) {
    config = JSON.parse(fs.readFileSync("./decking.json"));
  } else {
    throw new Error("could not find either 'decking.json' or 'decking.yaml'");
  }
  return Parser.load(config);
};

/**
 * @type {Object}
 */
Decking.prototype.commands = {
  help: function(done) {
    return this.help(done);
  },
  build: function(done) {
    return this.build(done);
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

// ----------

/**
 * @param {Function} done
 */
Decking.prototype.help = function(done) {
  var version = require(__dirname + "/../package.json").version;
  this.logger.log("\n" +
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
}

// ----------

/**
 * @param {Function} done
 */
Decking.prototype.build = function(done) {
  var image = this.args[0];
  if(image === "all") {
    var images = Object.keys(this.config.images);
    var self = this;
    return async.eachSeries(images, function(image, callback) {
      return self._build(image, callback);
    });
  } else {
    return this._build(image, done);
  }
};

/**
 * @param {String} image
 * @param {Function} done
 */
Decking.prototype._build = function(image, done) {

  if(!image) {
    throw new Error("Please supply an image name to build");
  }

  this.logger.log("Looking up build data for " + image);

  var target = this.config.images[image];
  if(!target) {
    throw new Error("Image " + image + " does not exist in decking.json");
  }

  var targetPath = target + "/Dockerfile";

  // @TODO for now, always assume we want to build from a Dockerfile
  // @TODO need a lot of careful validation here
  var self = this;
  var buildDep = false;

  if(self.hasArg("--no-dependencies")) {
    self.logger.log("Not building dependencies");
  } else {
    // Detecting local dependency
    var dockerfileContent = fs.readFileSync(targetPath);
    var fromRe = /^\s*from\s*(\S*)/i;
    var fromMatch = fromRe.exec(dockerfileContent);
    if (fromMatch) {
      var dependency = fromMatch[1];
      if (this.config.images[dependency]) {
        // the dependency is declared in the local images, let's build that one first
        buildDep = true;
        self.logger.log("Found dependency : " + dependency);
        self._build(dependency, function(err) {
          if (err) return done(err);
          continueFn();
        });
      }
    }
  }

  if (!buildDep) continueFn();

  function continueFn() {
    self.logger.log("Building image " + image + " from " + targetPath);

    var readStream = fs.createReadStream(targetPath);
    var writeStream = fs.createWriteStream("./Dockerfile");

    // ensure we don't try and create the tarball until the local Dockerfile exists
    writeStream.on("close", function() {
      var options = {t: image};
      if(self.hasArg("--no-cache")) {
        self.logger.log("Not using image cache");
        options.nocache = true;
      }

      self.logger.log("Uploading compressed context...");

      // @TODO allow user to specifiy --exclude params to avoid unnecessarily huge tarballs
      var tar = child_process.spawn("tar", ["-c", "-", "./"]);

      return self.docker.buildImage(tar.stdout, options, function(err, res) {
        fs.unlink("./Dockerfile", function(err) {
          if(err) return self.logger.log("[WARN] Could not remove Dockerfile");
        });
        if(err) return done(err);
        if(res.headers["content-type"] === "application/json") {
          res.pipe(JSONStream.parse("stream")).pipe(process.stdout);
        } else {
          // we don't need an if/else but let's keep it for clarity; it'd be too easy to
          // skim-read the code and misinterpret the first pipe otherwise
          res.pipe(process.stdout);
        }
        var data, error;
        res.on("error", done);
        res.on("data", function(raw) {
          data = (data ? data : '') + raw.toString();
          try {
            var jsonData = JSON.parse(data);
          } catch (e) {
            return;
          }
          if (!jsonData.stream && jsonData.error) {
            error = jsonData.error;
          }
          data = undefined;
        });
        return res.on("end", function() {
          if (error) {
            error = new Error("Docker build error: " + error);
          }
          done(error);
        });
      });
    });

    readStream.pipe(writeStream);
  }
};

// ----------

/**
 * @param {String} cmd
 * @param {Function} done
 */
Decking.prototype._run = function(cmd, done) {
  var key;
  var cluster = this.args[0];
  if(!cluster) {
    if(Object.keys(this.config.clusters).length != 1) {
      throw new Error("Please supply a cluster name");
    }
    // no cluster specified, but there's only one, so just default to it
    cluster = Object.keys(this.config.clusters).pop();
    this.logger.log("Defaulting to cluster '" + cluster + "'");
  }
  var target = this.config.clusters[cluster];
  if(!target) {
    throw new Error("Cluster " + cluster + " does not exist in decking.json");
  }
  if(target.group) {
    this.logger.log("Using overrides from group '" + target.group + "'\n");
  }
  return this[cmd](target, done);
};

// ----------

/**
 * @param {Object} cluster
 * @param {Function} done
 */
Decking.prototype.create = function(cluster, done) {

  // create a container based on metadata
  // for now due to remote API limitations this
  // is going to be a `run` followed quickly by a `stop`
  // @TODO use the remote API when it supports -name and -link
  // @TODO check the target image exists locally, otherwise
  // `docker run` will try to download it. we want to take care
  // of dependency resolution ourselves

  var self = this;
  return Cluster.resolveContainers(this.config, cluster, function(err, list) {
    return async.mapSeries(list, self._fetchIterator.bind(self), function(err, commands) {
      if(err) throw err;

      // once we've fetched any args (which might come from stdin) THEN
      // we can render the initial table
      self.table.setContainers(list);

      return async.eachSeries(commands, self._createIterator.bind(self), function(err) {
        if(err) throw err;
        // @FIXME hack to avoid ghosts with quick start/stop combos
        return setTimeout(function() {
          return async.eachLimit(list, 5, self._stopIteratorIterator.bind(self), done);
        }, 1000);
      });
    });
  });
};

/**
 * @param {Object} details
 * @param {Function} callback
 */
Decking.prototype._fetchIterator = function(details, callback) {
  var name = details.name;
  var container = this.docker.getContainer(name);
  var command = {
    name: name,
    container: container
  };
  return container.inspect(function(err, data) {
    if(!err) {
      command.exists = true;
      return callback(null, command);
    }

    // basic args we know we'll need

    // this starts to get a bit messy; we have to loop over
    // our container's options and using a closure bind a
    // function to run against each key/val - a function which
    // can potentially be asynchronous
    // we bung all these closures in an array which we *then*
    // pass to async. can't just use async.each here as that
    // only works on arrays
    var run = [];
    var sortedArgs = Runner.sortArgs(details.object);
    _.each(sortedArgs, function(val, key) {
      // run is going to be fed into async.series, it expects
      // to only fire a callback per iteration...
      return run.push(function(done) {
        return Runner.getArg(key, val, details, done);
      });
    });

    // now we've got our array of getRunArg calls bound to the right
    // variables, run them in order and add the results to the initial
    // run command
    return async.series(run, function(err, results) {
      if(err) throw err;
      command.exec = Runner.formatArgs(name, results);
      return callback(null, command);
    });
  });
};

/**
 * @param {Object} details
 * @param {Function} callback
 */
Decking.prototype._createIterator = function(command, callback) {
  var name = command.name;
  if(command.exists) {
    // already exists, BUT it might be a dependency so it needs starting
    // @TODO check if this container has dependents or not...
    this.table.render(name, "already exists - running in case of dependents");
    return this.isRunning(command.container, function(err, running) {
      if(!running) {
        return command.container.start(callback);
      }
      // container exists AND is running - stop, restart
      return command.container.stop({t: 5}, function(err) {
        return command.container.start(callback);
      });
    });
  }
  this.table.render(name, "creating...");
  var self = this;
  return child_process.exec(command.exec, function(err) {
    if(err) return callback(err);
    self.table.renderOk(name);
    return callback(null);
  });
};

/**
 * @param {Object} details
 * @param {Function} callback
 */
Decking.prototype._stopIteratorIterator = function(details, callback) {
  var container = this.docker.getContainer(details.name);
  return container.stop({t: 5}, function(err) {
    // For docker containers that never actually run, i.e. data containers,
    // the stop call returns a 304 as it isn't running. So ignore this error.
    if(err && err.statusCode == 304) {
      err = null;
    }
    return callback(err);
  });
};

// ----------

/**
 * @param {Object} cluster
 * @param {Function} done
 */
Decking.prototype.start = function(cluster, done) {
  var self = this;
  return self.resolveContainers(this.config, cluster, function(err, list) {
    return self.validateContainerPresence(list, function(err) {
      if(err) return done(err);
      return async.eachSeries(list, self._startIterator.bind(self), done);
    });
  });
};

/**
 * @param {Object} details
 * @param {Function} callback
 */
Decking.prototype._startIterator = function(details, callback) {
  var self = this;
  var name = details.name;
  var container = this.docker.getContainer(name);
  return this.isRunning(container, function(err, running) {
    if(!running) {
      self.table.render(name, "starting...");
      return container.start(function(err) {
        if(err) return callback(err);
        self.table.renderOk(name);
        return callback();
      });
    }
    self.table.render(name, "already running");
    return callback();
  });
};

// ----------

/**
 * @param {Object} cluster
 * @param {Function} done
 */
Decking.prototype.stop = function(cluster, done) {

  // @TODO reverse dependency order? shutdown process might
  // involve signalling to them (e.g. final write, disconnect)

  var self = this;
  return self.resolveContainers(this.config, cluster, function(err, list) {
    return self.validateContainerPresence(list, function(err) {
      if(err) return done(err);
      return async.eachSeries(list, self._stopIterator.bind(self), done);
    });
  });
};

/**
 * @param {Object} details
 * @param {Function} callback
 */
Decking.prototype._stopIterator = function(details, callback) {
  var self = this;
  var name = details.name;
  var container = this.docker.getContainer(name);
  return this.isRunning(container, function(err, running) {
    if(running) {
      self.table.render(name, "stopping...");
      return container.stop({t: 5}, function(err) {
        if(err) return callback(err);
        self.table.renderOk(name);
        return callback(null);
      });
    }
    self.table.render(name, "already stopped");
    return callback(null);
  });
};

// ----------

/**
 * @param {Object} cluster
 * @param {Function} done
 */
Decking.prototype.restart = function(cluster, done) {
  var self = this;
  return self.resolveContainers(this.config, cluster, function(err, list) {
    return self.validateContainerPresence(list, function(err) {
      if(err) return done(err);
      return async.eachSeries(list, self._restartIterator.bind(self), done);
    });
  });
};

/**
 * @param {Object} details
 * @param {Function} callback
 */
Decking.prototype._restartIterator = function(details, callback) {
  var self = this;
  var name = details.name;
  var container = this.docker.getContainer(name);
  return this.isRunning(container, function(err, running) {
    if(running) {
      self.table.render(name, "restarting...");
      return container.stop({t: 5}, function(err) {
        if(err) return callback(err);
        return container.start(function(err) {
          if(err) return callback(err);
          self.table.renderOk(name);
          return callback(null);
        });
      });
    }
    self.table.render(name, "starting...");
    return container.start(function(err) {
      if(err) return callback(err);
      self.table.renderOk(name);
      return callback(null);
    });
  });
};

// ----------

/**
 * @param {Object} cluster
 * @param {Function} done
 */
Decking.prototype.status = function(cluster, done) {
  var self = this;
  return self.resolveContainers(this.config, cluster, function(err, list) {
    return async.eachLimit(list, 3, self._statusIterator.bind(self), done);
  });
};

/**
 * @param {Object} details
 * @param {Function} callback
 */
Decking.prototype._statusIterator = function(details, callback) {
  var self = this;
  var name = details.name;
  var container = this.docker.getContainer(name);
  return container.inspect(function(err, data) {
    if(err) { // @TODO inspect
      self.table.render(name, "does not exist");
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
      self.table.render(name, str);
    } else {
      self.table.render(name, "stopped");
    }
    return callback(null);
  });
};

// ----------

/**
 * @param {Object} cluster
 * @param {Function} done
 */
Decking.prototype.attach = function(cluster, done) {
  var self = this;
  return self.resolveContainers(this.config, cluster, function(err, list) {
    return self.validateContainerPresence(list, function(err) {
      if(err) return done(err);
      return async.eachSeries(
        list,
        function(details, callback) {
          var container = self.docker.getContainer(details.name);
          return self._attachIterator(details.name, container, true, callback);
        },
        done
      );
    });
  });
};

/**
 * @param {String} name
 * @param {Object} container
 * @param {Boolean} fetchLogs
 * @param {Function} callback
 */
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
    new MultiplexStream(container, stream, self.table.padName(name, "(", ")"));
    stream.on("end", function() {
      self.logStream(name, "gone away, will try to re-attach for two minutes...");
      return self._reAttach(name, container);
    });
    return typeof callback === "function" ? callback(err) : void 0;
  });
};

/**
 * @param {String} name
 * @param {Object} container
 * @param {Integer} attempts
 */
Decking.prototype._reAttach = function(name, container, attempts) {
  var self = this;
  attempts = attempts || 0;
  return setTimeout(function() {
    return self.isRunning(container, function(err, running) {
      if(running) {
        return self._attachIterator(name, container, false, function() {
          return self.logStream(name, "re-attached");
        });
      } else {
        if(attempts < 200) {
          return self._reAttach(name, container, attempts + 1);
        } else {
          return self.logStream(name, "max re-attach attempts reached, bailing...");
        }
      }
    });
  }, 600);
};

// ----------

/**
 * @param {String} arg
 *
 * @return {Boolean}
 */
Decking.prototype.hasArg = function(arg) {
  return this.args.indexOf(arg) != -1;
};

/**
 * @param {String} name
 * @param {String} data`
 */
Decking.prototype.logStream = function(name, data) {
  return this.logger.log((this.table.padName(name, "(", ")")) + " " + data);
};

/**
 * @param {Object} config
 * @param {Object} cluster
 * @param {Function} callback
 */
Decking.prototype.resolveContainers = function(config, cluster, callback) {
  var self = this;
  return Cluster.resolveContainers(config, cluster, function(err, list) {
    self.table.setContainers(list);
    return callback(null, list);
  });
};

/**
 * @param {Array} list
 * @param {Function} done
 */
Decking.prototype.validateContainerPresence = function(list, done) {
  var self = this;
  return async.eachSeries(
    list,
    function(details, callback) {
      var container = self.docker.getContainer(details.name);
      return container.inspect(callback);
    },
    done
  );
};

/**
 * @param {Object} container
 * @param {Function} callback
 */
Decking.prototype.isRunning = function(container, callback) {
  return container.inspect(function(err, data) {
    return callback(err, data.State.Running);
  });
};

// ----------

module.exports = Decking;
