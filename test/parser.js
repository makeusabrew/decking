// Dependencies
var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");
chai.use(require("sinon-chai"));

// Lib
Parser = require("../lib/parser");

// ----------

describe("Parser", function() {

  beforeEach(function() {
    return this.config = {};
  });

  it("exposes the correct method", function() {
    expect(Parser.load).to.be.a("function");
  });

  describe("with no containers", function() {

    beforeEach(function() {
      var e;
      try {
        return Parser.load(this.config);
      } catch (_error) {
        e = _error;
        return this.e = e;
      }
    });

    it("throws the correct error", function() {
      expect(this.e.message).to.eql("No containers defined!");
    });
  });

  describe("with an empty containers object", function() {

    beforeEach(function() {
      var e;
      this.config.containers = {};
      try {
        return Parser.load(this.config);
      } catch (_error) {
        e = _error;
        return this.e = e;
      }
    });

    it("throws the correct error", function() {
      expect(this.e.message).to.eql("No containers defined!");
    });
  });

  describe("with no clusters", function() {

    beforeEach(function() {
      var e;
      this.config.containers = {
        "foo": "bar"
      };
      try {
        return Parser.load(this.config);
      } catch (_error) {
        e = _error;
        return this.e = e;
      }
    });

    it("throws the correct error", function() {
      expect(this.e.message).to.eql("No clusters defined!");
    });
  });

  describe("with an empty clusters object", function() {

    beforeEach(function() {
      var e;
      this.config.containers = {
        "foo": "bar"
      };
      this.config.clusters = {};
      try {
        return Parser.load(this.config);
      } catch (_error) {
        e = _error;
        return this.e = e;
      }
    });

    it("throws the correct error", function() {
      expect(this.e.message).to.eql("No clusters defined!");
    });
  });

  describe("with one empty cluster", function() {

    beforeEach(function() {
      var e;
      this.config.clusters = {
        baz: []
      };
      this.config.containers = {
        "foo": "bar"
      };
      try {
        return Parser.load(this.config);
      } catch (_error) {
        e = _error;
        return this.e = e;
      }
    });

    it("throws the correct error", function() {
      expect(this.e.message).to.eql("Cluster baz is empty");
    });
  });

  describe("basic container definition", function() {

    beforeEach(function() {
      return this.config = {
        containers: {},
        clusters: {
          test: ["test"]
        }
      };
    });

    describe("longhand notation", function() {

      beforeEach(function() {
        this.config.containers = {
          test: {
            image: "test/image"
          }
        };
        return Parser.load(this.config);
      });

      it("assigns the correct image to the container", function() {
        expect(this.config.containers.test.image).to.eql("test/image");
      });

      it("assigns an empty dependencies array to the container", function() {
        expect(this.config.containers.test.dependencies).to.eql([]);
      });

      it("assigns an empty aliases array to the container", function() {
        expect(this.config.containers.test.aliases).to.eql([]);
      });
    });

    describe("shorthand notation", function() {

      beforeEach(function() {
        this.config.containers = {
          test: "image/name"
        };
        return Parser.load(this.config);
      });

      it("assigns the correct image to the container", function() {
        expect(this.config.containers.test.image).to.eql("image/name");
      });
    });
  });

  describe("dependency definitions", function() {

    beforeEach(function() {
      return this.config = {
        containers: {
          dep1: "image/dep"
        },
        clusters: {
          test: ["test"]
        }
      };
    });

    describe("when a listed dependency does not exist ", function() {

      beforeEach(function() {
        var e;
        this.config.containers.test = {
          image: "image/test",
          dependencies: ["invalid"]
        };
        try {
          return Parser.load(this.config);
        } catch (_error) {
          e = _error;
          return this.e = e;
        }
      });

      it("throws the expected error", function() {
        expect(this.e.message).to.eql("Dependency 'invalid' of container 'test' does not exist!");
      });
    });

    describe("when a listed dependency exists", function() {

      describe("when not specifying an alias", function() {

        beforeEach(function() {
          this.config.containers.test = {
            image: "image/test",
            dependencies: ["dep1"]
          };
          return Parser.load(this.config);
        });

        it("populates the container's dependencies correctly", function() {
          expect(this.config.containers.test.dependencies).to.eql(["dep1"]);
        });

        it("populates the container's aliases correctly", function() {
          expect(this.config.containers.test.aliases).to.eql(["dep1"]);
        });
      });

      describe("when specifying an alias", function() {

        beforeEach(function() {
          this.config.containers.test = {
            image: "image/test",
            dependencies: ["dep1:alias1"]
          };
          return Parser.load(this.config);
        });

        it("populates the container's dependencies correctly", function() {
          expect(this.config.containers.test.dependencies).to.eql(["dep1"]);
        });

        it("populates the container's aliases correctly", function() {
          expect(this.config.containers.test.aliases).to.eql(["alias1"]);
        });
      });
    });
  });

  describe("basic cluster definition", function() {

    beforeEach(function() {
      return this.config = {
        containers: {
          test: "image/name"
        }
      };
    });

    describe("when a container referenced by the cluster does not exist", function() {

      beforeEach(function() {
        var e;
        this.config.clusters = {
          cluster: {
            containers: ["invalid"]
          }
        };
        try {
          return Parser.load(this.config);
        } catch (_error) {
          e = _error;
          return this.e = e;
        }
      });

      it("throws the expected error", function() {
        expect(this.e.message).to.eql("Container invalid does not exist");
      });
    });

    describe("longhand notation", function() {

      beforeEach(function() {
        this.config.clusters = {
          cluster: {
            containers: ["test"]
          }
        };
        return Parser.load(this.config);
      });

      it("assigns the correct containers to the cluster", function() {
        expect(this.config.clusters.cluster.containers).to.be.an("array");
        expect(this.config.clusters.cluster.containers).to.have.lengthOf(1);
      });

      it("assigns the correct name to the cluster's container", function() {
        expect(this.config.clusters.cluster.containers[0].name).to.eql("test");
      });

      it("assigns the correct initial count to the cluster's container", function() {
        expect(this.config.clusters.cluster.containers[0].count).to.eql(1);
      });

      it("assigns an object property to the cluster's container", function() {
        expect(this.config.clusters.cluster.containers[0].object).to.be.an("object");
      });
    });

    describe("shorthand notation", function() {

      beforeEach(function() {
        this.config.clusters = {
          cluster: ["test"]
        };
        return Parser.load(this.config);
      });

      it("assigns the correct containers to the cluster", function() {
        expect(this.config.clusters.cluster.containers).to.be.an("array");
        expect(this.config.clusters.cluster.containers).to.have.lengthOf(1);
      });
    });
  });
});
