// Dependencies
var _ = require("lodash");
var async = require("async");
var child_process = require("child_process");
var Docker = require("dockerode");
var fs = require("fs");
var url = require("url");
var JSONStream = require("JSONStream");
var util = require("util");
var YAML = require("js-yaml");
var path = require("path");

// Lib
var Cluster = require("./cluster");
var Logger = require("./logger");
var MultiplexStream = require("./multiplex_stream");
var Parser = require("./parser");
var Runner = require("./runner");
var Table = require("./table");

var awaitPort = require("tcp-port-used").waitUntilUsedOnHost;

// timeout after which we give up waiting if `ready` is used
var READY_TIMEOUT = 15000;
// interval between probing the `ready` port
var READY_WAIT = 200;

// @FIXME: this file is massive. needs splitting out into easier
// to digest modules

// ----------

// move to separate file
function dockerConnection() {
  var host = url.parse(process.env.DOCKER_HOST || '');

  if (!host.hostname) {
    return {
      socketPath : process.env.DOCKER_HOST || '/var/run/docker.sock'
    };
  }

  var tlsOn = (process.env.DOCKER_TLS_VERIFY || '0') === '1';
  var protocol = host.protocol === 'tcp:' ? (tlsOn ? 'https' : 'http') : host.protocol.substr(0, host.protocol.length - 1);

  var certPath = (process.env.DOCKER_CERT_PATH + '/') || '';

  return {
    protocol : protocol,
    host     : host.hostname,
    port     : parseInt(host.port) || 4243,
    ca       : fs.readFileSync(certPath + 'ca.pem'),
    cert     : fs.readFileSync(certPath + 'cert.pem'),
    key      : fs.readFileSync(certPath + 'key.pem')
  };
}

/**
 * @param {Object} options { command: "", args: [] }
 */
function Decking(options) {

  this.command = options ? options.command : undefined;
  this.args = options && options.args ? options.args : [];
  this.config = {};

  // rename, this is confusing
  this.docker = new Docker(dockerConnection());
  this.logger = new Logger();
  this.table = new Table(this.logger);
}

/**
 *
 * @throws {Error}
 */
Decking.prototype.execute = function() {

  if(!this.command || this.command == "-h" || this.command == "--help") {
    this.command = "help";
  }

  var fn = this.commands[this.command];
  if (typeof fn !== "function") {
    throw new Error("Unknown method " + this.command);
  }

  if (this.command !== "help") {
    this.config = this.loadConfig();
  }

  return fn.call(this, function(err) {
    if (err) {
      throw err;
    }
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
  } else if (yamlConfig) {
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
    // commands.dispatch("help", done);
    return this.help(done);
  },
  build: function(done) {
    return this.build(done);
  },
  create: function(done) {
    // commands.run("create", done); ?
    return this._run("create", done);
  },
  destroy: function(done) {
    return this._run("destroy", done);
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

  this.logger.log(
    "\n" +
    "Usage: decking COMMAND [arg...]\n\n" +
    "Commands:\n" +
    "    build      build an image or pass 'all' to build all\n" +
    "    create     create a cluster of containers\n" +
    "    destroy    destroy a cluster of containers\n" +
    "    start      start a cluster\n" +
    "    stop       stop a cluster\n" +
    "    restart    restart a cluster\n" +
    "    status     check the status of a cluster's containers\n" +
    "    attach     attach to all running containers in a cluster\n\n" +
    "Version: " + version + "\n"
  );
  return done();
};

// ----------

/**
 * @param {Function} done
 */
Decking.prototype.build = function(done) {
  var image = this.args[0];
  var tag = this.getArg("--tag") || "latest";

  // maybe?
  //var cmd = new Command("build");
  //cmd.execute();

  if(image === "all") {
    var images = Object.keys(this.config.images);
    var self = this;
    return async.eachSeries(images, function(image, callback) {
      return self._build(image, tag, callback);
    });
  }
  return this._build(image, tag, done);
};

/**
 * @param {String} image
 * @param {String} tag
 * @param {Function} done
 */
Decking.prototype._build = function(image, tag, done) {

  var self = this;
  var config;
  var target;
  var includes;
  var context;
  var localPath;
  var contextRoot;
  var dockerfile;
  var baseArgs;
  var args;
  var tarOptions;
  var tar;

  if (!image) {
    throw new Error("Please supply an image name to build");
  }

  if (!tag) {
    throw new Error("Please supply a tag name to build");
  }

  config = this.config.images[image];

  if (!config) {
    throw new Error("Image " + image + " does not exist in decking.json");
  }

  if (typeof config === "string") {
    config = {
      path: config,
      context: null,
      includes: null
    };
  }

  if (!config.path) {
    throw new Error("Image path property does not exist in decking.json");
  }

  target = config.path;
  includes = config.includes || [];
  context = config.context || process.cwd();

  // support a shorthand config option to take context
  // from the same dir as the Dockerfile
  if (context === ".") {
    context = target;
  }

  // ... but we can always override context from the command line
  if (this.hasArg("--context")) {
    context = this.getArg("--context");
    target = context;
  }

  localPath   = path.resolve(context);
  targetPath  = path.resolve(target);
  contextRoot = path.relative(localPath, targetPath);
  dockerfile  = path.join(contextRoot, "Dockerfile");

  this.logger.log("Using " + localPath + " as build context");
  this.logger.log("ADD and COPY directives must be relative to the above directory");
  this.logger.log("");
  this.logger.log("Building image " + image + ":" + tag);

  if (includes.length > 0) {
    this.logger.log("Including " + JSON.stringify(includes));
  }

  self = this;

  options = {
    t: image + ":" + tag,
    // always remove intermediates, even *if* build fails
    forcerm: true,
    dockerfile: dockerfile
  };

  if (self.hasArg("--no-cache")) {
    self.logger.log("Not using image cache");
    options.nocache = true;
  }

  self.logger.log("Uploading compressed context...");

  baseArgs = ["-c", "-"];
  args = includes.length === 0 ? baseArgs.concat(["./"]) : baseArgs.concat(dockerfile).concat(includes);
  tarOptions = {cwd: context};
  tar = child_process.spawn("tar", args, tarOptions);

  //self.logger.log("tar " + args.join(" "));

  return self.docker.buildImage(tar.stdout, options, function (err, res) {
    if (err) {
      self.logger.log("[ERROR] could not build image: " + err);
      return done(err);
    }

    var errors = [];
    var errStream = res.pipe(JSONStream.parse("error"));

    errStream.on("data", function(chunk) {
      errors.push(chunk);
    });
    errStream.pipe(process.stderr);

    res
    .pipe(JSONStream.parse("stream"))
    .pipe(process.stdout);

    return res.on("end", function() {
      if (errors.length > 0) {
        // errors don't have trailing newlines; chances are the
        // last thing printed was an error to stderr so we need
        // to force a line break before continuing
        self.logger.log("");
        var err = new Error(errors.join("\n"));
        return done(err);
      }
      return done();
    });
  });
};

// ----------

/**
 * @param {String} cmd
 * @param {Function} done
 */
Decking.prototype._run = function(cmd, done) {
  var key;
  var cluster = this.args[0];

  if (!cluster) {
    if (Object.keys(this.config.clusters).length !== 1) {
      throw new Error("Please supply a cluster name");
    }

    // no cluster specified, but there's only one, so just default to it
    cluster = Object.keys(this.config.clusters).pop();
    this.logger.log("Defaulting to cluster '" + cluster + "'");
  }

  var target = this.config.clusters[cluster];

  if (!target) {
    throw new Error("Cluster " + cluster + " does not exist in decking.json");
  }

  if (target.group) {
    var str = "Using overrides from group '" + target.group + "'";

    var alias = this.getArg("--as");
    if (alias) {
      str += " aliased to '" + alias + "'";
      target.alias = alias;
    }

    this.logger.log(str + "\n");
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
  // @TODO check the target image exists locally, otherwise
  // `docker create` will try to download it. we want to take care
  // of dependency resolution ourselves

  var self = this;
  return Cluster.resolveContainers(this.config, cluster, function(err, list) {
    return async.mapSeries(list, self._fetchIterator.bind(self), function(err, commands) {
      if (err) {
        throw err;
      }

      // once we've fetched any args (which might come from stdin) THEN
      // we can render the initial table
      self.table.setContainers(list);

      return async.eachSeries(commands, self._createIterator.bind(self), done);
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

    // this starts to get a bit messy; we have to loop over
    // our container's options and using a closure bind a
    // function to run against each key/val - a function which
    // can potentially be asynchronous
    // we bung all these closures in an array which we *then*
    // pass to async. can't just use async.each here as that
    // only works on arrays
    var sortedArgs = Runner.filterArgs(details.object);
    var run = _.map(sortedArgs, function(val, key) {
      // run is going to be fed into async.series, it expects
      // to only fire a callback per iteration...
      return function(done) {
        Runner.getArg(key, val, details, done);
      };
    });

    // now we've got our array of getRunArg calls bound to the right
    // variables, run them in order and add the results to the initial
    // run command
    return async.series(run, function(err, results) {
      if (err) {
        throw err;
      }
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
  if (command.exists) {
    this.table.renderFinal(name, "already exists");
    return callback();
  }

  this.table.render(name, "creating...");
  var self = this;
  return child_process.exec(command.exec, function(err) {
    if(err) return callback(err);
    self.table.renderOk(name);
    return callback();
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
      if (err) {
        return done(err);
      }
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
  var isData = details.object.data;
  var container = this.docker.getContainer(name);

  return this.isRunning(container, function(err, running) {
    if (running) {
      self.table.renderFinal(name, "already running");
      return callback();
    }

    if (isData) {
      self.table.renderFinal(name, "skipping...");
      return callback();
    }

    self.table.render(name, "starting...");

    return container.start(function(err) {
      if (err) {
        return callback(err);
      }

      if (details.object.ready) {
        // @TODO support variants of ready:
        // port:N => TCP port
        // delay:N => fixed setTimeout
        // integer => TCP port (as implemented below)
        self.table.render(name, "waiting... ");
        return container.inspect(function(err, data) {
          awaitPort(details.object.ready, data.NetworkSettings.IPAddress, READY_WAIT, READY_TIMEOUT)
          .then(function() {
            setTimeout(function() {
              self.table.renderOk(name);
              return callback();
            }, 100);
          }, function(err) {
            // assume a timeout I guess? But carry on anyway...
            self.table.renderOk(name);
            return callback();
          });
        });
      }

      self.table.renderOk(name);
      return callback();
    });
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
      if (err) {
        return done(err);
      }
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
  var isData = details.object.data;
  var container = this.docker.getContainer(name);

  return this.isRunning(container, function(err, running) {
    if (running) {
      self.table.render(name, "stopping...");

      return container.stop({t: 5}, function(err) {
        if(err) return callback(err);
        self.table.renderOk(name);
        return callback(null);
      });
    }

    if (isData) {
      self.table.renderFinal(name, "skipping...");
    } else {
      self.table.renderFinal(name, "already stopped");
    }
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
  var isData = details.object.data;
  var container = this.docker.getContainer(name);

  return this.isRunning(container, function(err, running) {
    if (!running) {
      return self._startIterator(details, callback);
    }

    self.table.render(name, "stopping...");

    return container.stop({t: 5}, function(err) {
      if (err) {
        return callback(err);
      }

      self.table.render(name, "restarting...");
      return self._startIterator(details, callback);
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
  var isData = details.object.data;
  var container = this.docker.getContainer(name);

  return container.inspect(function(err, data) {
    if (err) {
      if (err.statusCode === 404) {
        self.table.renderFinal(name, "does not exist");
      } else {
        return callback(err);
      }
    } else if (data.State.Running) {
      var str = "running  " + data.NetworkSettings.IPAddress;

      _.each(data.NetworkSettings.Ports, function(host, local) {
        host = host ? host[0] : null;
        str += "  ";
        if(host) {
          str += host.HostPort + "->";
        }
        str += local;
      });

      self.table.renderFinal(name, str);
    } else if (isData) {
      self.table.renderFinal(name, "(data)");
    } else {
      self.table.renderFinal(name, "stopped");
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
      self.logStream(name, "gone away, will try to re-attach...");
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
  attempts = attempts || 0;

  var self = this;
  var delay = 500;  // @TODO incremental backoff based on attempts

  return setTimeout(function() {
    return self.isRunning(container, function(err, running) {
      if(running) {
        return self._attachIterator(name, container, false, function() {
          return self.logStream(name, "re-attached");
        });
      } else {
        if(attempts < 1000) {
          return self._reAttach(name, container, attempts + 1);
        } else {
          return self.logStream(name, "max re-attach attempts reached, bailing...");
        }
      }
    });
  }, delay);
};

// ----------

/**
 * @param {String} arg
 *
 * @return {Boolean}
 */
Decking.prototype.hasArg = function(arg) {
  return this.args.indexOf(arg) !== -1;
};

Decking.prototype.getArg = function(arg) {
  var index = this.args.indexOf(arg);
  if (index === -1) {
    return null;
  }
  return this.args[index + 1];
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
    if (err) {
      return callback(err);
    }
    return callback(null, data.State.Running);
  });
};

/**
 * @param {Object} cluster
 * @param {Function} done
 */
Decking.prototype.destroy = function(cluster, done) {

  var self = this;
  return self.resolveContainers(this.config, cluster, function(err, list) {
    return async.eachSeries(list, self._destroyIterator.bind(self), done);
  });
};

/**
 * @param {Object} details
 * @param {Function} callback
 */
Decking.prototype._destroyIterator = function(details, callback) {
  var self = this;
  var name = details.name;
  var isData = details.object.data;
  var isPersistent = details.object.persistent;
  var container = this.docker.getContainer(name);
  var params = {
    force: true,
    v: this.hasArg("--include-volumes")
  };

  if (isData && !this.hasArg("--include-data")) {
    self.table.renderFinal(name, "skipping (data)...");
    return callback();
  }

  if (isPersistent && !this.hasArg("--include-persistent")) {
    self.table.renderFinal(name, "skipping (persistent)...");
    return callback();
  }

  this.table.render(name, "destroying...");

  return container.remove(params, function(err) {
    if (err) {
      if (err.statusCode === 404) {
        self.table.renderFinal(name, "does not exist");
        return callback();
      }
      return callback(err);
    }

    self.table.renderOk(name);
    return callback();
  });
};

// ----------

module.exports = Decking;
