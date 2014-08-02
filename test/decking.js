// Dependencies
var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");
chai.use(require("sinon-chai"));

// Lib
Decking = require("../lib/decking");

// ----------

describe("Decking", function() {

  it("is a function", function() {
    expect(Decking).to.be.a("function");
  });

  describe("When invoked", function() {

    describe("Without any options", function() {

      beforeEach(function() {
        return this.decking = new Decking;
      });

      it("returns an object", function() {
        expect(this.decking).to.be.an.object;
      });

      it("has no command property", function() {
        expect(this.decking.command).to.be.undefined;
      });

      it("has an empty arguments array", function() {
        expect(this.decking.args).to.eql([]);
      });
    });

    describe("With a command option", function() {
      beforeEach(function() {
        return this.decking = new Decking({
          command: "foo"
        });
      });

      it("has the correct command property", function() {
        expect(this.decking.command).to.eql("foo");
      });

      it("has an empty arguments array", function() {
        expect(this.decking.args).to.eql([]);
      });
    });

    describe("With an args option", function() {
      beforeEach(function() {
        return this.decking = new Decking({
          args: ["foo"]
        });
      });

      it("has no command property", function() {
        expect(this.decking.command).to.be.undefined;
      });

      it("has an empty arguments array", function() {
        expect(this.decking.args).to.eql(["foo"]);
      });
    });

    describe("With both options", function() {
      beforeEach(function() {
        return this.decking = new Decking({
          command: "foo",
          args: ["bar"]
        });
      });

      it("has the correct command property", function() {
        expect(this.decking.command).to.eql("foo");
      });

      it("has an empty arguments array", function() {
        expect(this.decking.args).to.eql(["bar"]);
      });
    });
  });
});

describe("Instance methods", function() {

  describe("execute", function() {

    beforeEach(function() {
      this.decking = new Decking;
      return this.execute = function(cmd) {
        if (cmd == null) {
          cmd = null;
        }
        this.decking.command = cmd;
        return this.decking.execute();
      };
    });

    describe("Given a stubbed help method", function() {

      beforeEach(function() {
        return this.stub = sinon.stub(this.decking.commands, "help");
      });

      afterEach(function() {
        return this.stub.restore();
      });

      describe("with no command", function() {
        beforeEach(function() {
          return this.execute();
        });
        it("should invoke the help method", function() {
          expect(this.stub).to.have.been.called;
        });
      });

      describe("with -h", function() {
        beforeEach(function() {
          return this.execute("-h");
        });
        it("should invoke the help method", function() {
          expect(this.stub).to.have.been.called;
        });
      });

      describe("with --help", function() {
        beforeEach(function() {
          return this.execute("--help");
        });
        it("should invoke the help method", function() {
          expect(this.stub).to.have.been.called;
        });
      });
    });

    describe("with an unknown command", function() {

      beforeEach(function() {
        var e;
        try {
          return this.execute("foo");
        } catch (_error) {
          e = _error;
          return this.e = e;
        }
      });

      it("throws the expected error", function() {
        expect(this.e.message).to.eql("Unknown method foo");
      });
    });

    describe("with no local decking.json file", function() {

      beforeEach(function() {
        var e;
        try {
          return this.execute("create");
        } catch (_error) {
          e = _error;
          return this.e = e;
        }
      });

      it("throws the expected error", function() {
        expect(this.e.message).to.eql("ENOENT, no such file or directory './decking.json'");
      });
    });
  });

  describe("hasArg", function() {

    beforeEach(function() {
      return this.decking = new Decking;
    });

    describe("When the argument exists", function() {

      beforeEach(function() {
        this.decking.args = ["foo", "myarg"];
        return this.result = this.decking.hasArg("myarg");
      });

      it("returns true", function() {
        expect(this.result).to.be["true"];
      });
    });

    describe("When the argument does not exist", function() {

      beforeEach(function() {
        this.decking.args = ["foo", "myarg"];
        return this.result = this.decking.hasArg("somearg");
      });

      it("returns true", function() {
        expect(this.result).to.be["false"];
      });
    });
  });
});