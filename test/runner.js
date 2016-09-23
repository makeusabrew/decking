// Dependencies
var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");
chai.use(require("sinon-chai"));

// Lib
Runner = require("../lib/runner");

// ----------

describe("Runner", function() {

  it("exposes the correct methods", function() {
    expect(Runner.getArg).to.be.a("function");
    expect(Runner.filterArgs).to.be.a("function");
    return expect(Runner.formatArgs).to.be.a("function");
  });

  describe("getArg", function() {

    describe("env", function() {

      describe("with static values", function() {

        beforeEach(function(done) {
          return Runner.getArg("env", ["ENV1=val1", "ENV2=val2"], {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("transforms the values correctly", function() {
          return expect(this.arg).to.eql(["-e ENV1=val1", "-e ENV2=val2"]);
        });
      });

      return describe("with a dynamic value", function() {

        describe("where the host has a valid environment variable for the given key", function() {

          beforeEach(function(done) {
            process.env["ENV1"] = "test";
            return Runner.getArg("env", ["ENV1=-", "ENV2=val2"], {}, (function(_this) {
              return function(err, arg) {
                _this.arg = arg;
                return done();
              };
            })(this));
          });

          afterEach(function() {
            return delete process.env["ENV1"];
          });

          return it("transforms the values correctly", function() {
            return expect(this.arg).to.eql(["-e ENV1=test", "-e ENV2=val2"]);
          });
        });

        return describe("where the host does not have a valid environment variable", function() {

          return describe.skip("Given a stubbed user response", function() {

            beforeEach(function(done) {
              Runner.getArg("env", ["ENV1=-", "ENV2=val2"], {}, (function(_this) {
                return function(err, arg) {
                  _this.arg = arg;
                  return done();
                };
              })(this));
              return setTimeout(function() {
                return process.stdin.write("foo\r\n");
              }, 100);
            });

            return it("transforms the values correctly", function() {
              return expect(this.arg).to.eql(["-e ENV1=input", "-e ENV2=val2"]);
            });
          });
        });
      });
    });

    describe("dependencies", function() {

      describe("with no group override", function() {

        beforeEach(function(done) {
          var container;
          container = {
            object: {
              aliases: ["dep1", "alias2"]
            }
          };
          return Runner.getArg("dependencies", ["dep1", "dep2"], container, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("transforms the values correctly", function() {
          return expect(this.arg).to.eql(["--link dep1:dep1", "--link dep2:alias2"]);
        });
      });

      return describe("with a group override", function() {

        beforeEach(function(done) {
          var container;
          container = {
            group: "dev",
            object: {
              aliases: ["dep1", "alias2"]
            }
          };
          return Runner.getArg("dependencies", ["dep1", "dep2"], container, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("applies the correct container namespace to each link", function() {
          return expect(this.arg).to.eql(["--link dep1.dev:dep1", "--link dep2.dev:alias2"]);
        });
      });
    });

    describe("port", function() {

      beforeEach(function(done) {
        return Runner.getArg("port", ["8080:8080", "8888"], {}, (function(_this) {
          return function(err, arg) {
            _this.arg = arg;
            return done();
          };
        })(this));
      });

      return it("transforms the values correctly", function() {
        return expect(this.arg).to.eql(["-p 8080:8080", "-p 8888"]);
      });
    });

    describe("privileged", function() {

      describe("when falsy", function() {

        beforeEach(function(done) {
          return Runner.getArg("privileged", false, {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("does not apply the flag", function() {
          return expect(this.arg).to.eql([]);
        });
      });

      return describe("when truthy", function() {

        beforeEach(function(done) {
          return Runner.getArg("privileged", true, {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("applies the flag", function() {
          return expect(this.arg).to.eql(["-privileged"]);
        });
      });
    });

    describe("restart", function() {

      describe("with string literals", function() {

        beforeEach(function(done) {
          return Runner.getArg("restart", "always", {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("transforms the value correctly", function() {
          return expect(this.arg).to.eql(["--restart always"]);
        });
      });

    });

    describe("mount", function() {

      describe("with string literals", function() {

        beforeEach(function(done) {
          return Runner.getArg("mount", ["/path/to/host:/path/to/container"], {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("transforms the values correctly", function() {
          return expect(this.arg).to.eql(["-v /path/to/host:/path/to/container"]);
        });
      });

      describe("with the special dot value", function() {

        beforeEach(function(done) {
          return Runner.getArg("mount", [".:/path/to/container"], {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("replaces the dot with the current working directory", function() {
          return expect(this.arg).to.eql(["-v " + (process.cwd()) + ":/path/to/container"]);
        });
      });

      describe("with the special dot value at the start of the string", function() {

        beforeEach(function(done) {
          return Runner.getArg("mount", ["./test:/path/to/container"], {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("replaces the dot but keeps the path after it", function() {
          return expect(this.arg).to.eql(["-v " + (process.cwd()) + "/test:/path/to/container"]);
        });
      });

      return describe("with the dot value anywhere else in string", function() {

        beforeEach(function(done) {
          return Runner.getArg("mount", ["/path/to/.ssh:/path/to/container"], {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("does not replace the dot value", function() {
          return expect(this.arg).to.eql(["-v /path/to/.ssh:/path/to/container"]);
        });
      });
    });

    describe("mount-from", function() {

      describe("with string literals", function() {

        beforeEach(function(done) {
          return Runner.getArg("mount-from", ["parent"], {}, (function(_this) {
            return function(err, arg) {
              _this.arg = arg;
              return done();
            };
          })(this));
        });

        return it("transforms the values correctly", function() {
          return expect(this.arg).to.eql(["--volumes-from parent"]);
        });
      });
    });

    describe("image", function() {

      beforeEach(function(done) {
        return Runner.getArg("image", "image/name", {}, (function(_this) {
          return function(err, arg) {
            _this.arg = arg;
            return done();
          };
        })(this));
      });

      return it("returns the image name only", function() {
        return expect(this.arg).to.eql(["image/name"]);
      });
    });

    describe("extra", function() {

      beforeEach(function(done) {
        return Runner.getArg("extra", "foo bar", {}, (function(_this) {
          return function(err, arg) {
            _this.arg = arg;
            return done();
          };
        })(this));
      });

      return it("returns the argument unaltered", function() {
        return expect(this.arg).to.eql(["foo bar"]);
      });
    });

    return describe("unknown argument", function() {

      beforeEach(function(done) {
        return Runner.getArg("foo", "baz", {}, (function(_this) {
          return function(err, arg) {
            _this.err = err;
            _this.arg = arg;
            return done();
          };
        })(this));
      });

      return it("returns an error object", function() {
        return expect(this.err.message).to.eql("Unknown argument foo");
      });
    });
  });

  describe("filterArgs", function() {

    describe("given an object with keys out of order", function() {

      beforeEach(function() {
        var object;
        object = {
          image: "an/image",
          extra: "foo bar",
          env: "FOO=bar"
        };
        return this.result = Runner.filterArgs(object);
      });

      return it("returns a correctly ordered object", function() {
        return expect(this.result).to.eql({
          env: "FOO=bar",
          image: "an/image",
          extra: "foo bar"
        });
      });
    });

    return describe("given an object with unknown keys", function() {

      beforeEach(function() {
        var object;
        object = {
          image: "an/image",
          env: "FOO=bar",
          unknown: "key"
        };
        return this.result = Runner.filterArgs(object);
      });

      return it("returns a correctly filtered object", function() {
        return expect(this.result).to.eql({
          env: "FOO=bar",
          image: "an/image"
        });
      });
    });
  });

  return describe("formatArgs", function() {

    return describe("given valid details", function() {

      beforeEach(function() {
        return this.result = Runner.formatArgs("container", ["-e", "ENV=foo"]);
      });

      return it("returns the expected string", function() {
        return expect(this.result).to.eql("docker run -d --name container -e ENV=foo");
      });
    });
  });
});
