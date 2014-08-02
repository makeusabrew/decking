
// Dependencies
var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");
chai.use(require("sinon-chai"));

// Lib
Decking = require("../lib/decking");

// ----------

describe("create method", function() {

  beforeEach(function() {
    return this.decking = new Decking;
  });

  return describe("with stubbed configuration", function() {

    beforeEach(function() {
      return this.stub = sinon.stub(require("fs"), "readFileSync", function() {
        return JSON.stringify({
          containers: {
            test: "image"
          },
          clusters: {
            foo: ["test"]
          }
        });
      });
    });

    afterEach(function() {
      return this.stub.restore();
    });

    return describe.skip("when invoked", function() {

      beforeEach(function(done) {
        this.decking.command = "create";
        return this.decking.execute(done);
      });

      it("works", function() {
        expect(0).to.eql(1);
      });
    });
  });
});
