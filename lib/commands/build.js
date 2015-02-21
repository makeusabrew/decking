exports.method = function(image, tag, done) {
  if (!image) {
    throw new Error("Please supply an image name to build");
  }

  if (!tag) {
    throw new Error("Please supply a tag name to build");
  }

  this.logger.log("Looking up build data for " + image);

  var config = this.config.images[image];
  if (!config) {
    throw new Error("Image " + image + " does not exist in decking.json");
  }

  var target;
  var includes = [];
  if (typeof config === "string") {
    target = config;
  } else {
    target = config.dockerfile;
    if (!target) {
      throw new Error("Image dockerfile property does not exist in decking.json");
    }
    includes = config.includes || [];
  }

  var targetPath = path.resolve(target);
  var localPath = path.resolve(process.cwd());

  this.logger.log("Copying Dockerfile " + targetPath + " to " + localPath);
  this.logger.log("Please bear in mind the effect this will have on any ADD directives it contains");
  this.logger.log("");
  this.logger.log("Building image " + image + ":" + tag + " from " + targetPath);

  if (includes.length > 0) {
    this.logger.log("Including " + JSON.stringify(includes));
  }

  // @TODO for now, always assume we want to build from a Dockerfile
  // @TODO need a lot of careful validation here
  var readStream = fs.createReadStream(path.join(targetPath, "Dockerfile"));
  var writeStream = fs.createWriteStream(path.join(localPath, "Dockerfile"));
  var self = this;

  // ensure we don't try and create the tarball until the local Dockerfile exists
  writeStream.on("close", function() {
    var options = {
      t: image + ":" + tag,
      // always remove intermediates, even *if* build fails
      forcerm: true
    };

    if (self.hasArg("--no-cache")) {
      self.logger.log("Not using image cache");
      options.nocache = true;
    }

    self.logger.log("Uploading compressed context...");

    var baseArgs = ["-c", "-"];
    var args = includes.length === 0 ? baseArgs.concat(["./"]) : baseArgs.concat(['Dockerfile']).concat(includes);
    var tar = child_process.spawn("tar", args);

    return self.docker.buildImage(tar.stdout, options, function (err, res) {
      fs.unlink(path.join(localPath, "Dockerfile"), function(err) {
        if (err) {
          return self.logger.log("[WARN] Could not remove Dockerfile");
        }
      });

      if (err) {
        self.logger.log("[ERROR] could not build image: " + err);
        return done(err);
      }

      res
      .pipe(JSONStream.parse("stream"))
      .pipe(process.stdout);

      var errStream = JSONStream.parse("errorDetail");
      errStream.on("data", function(d) {
        var error = new Error(d.message);
        return done(error);
      });

      res.pipe(errStream);

      res.on("end", done);
    });
  });

  readStream.pipe(writeStream);
};
