chai   = require "chai"
expect = chai.expect
sinon  = require "sinon"
chai.use require("sinon-chai")

Decking = require "../src/decking"


describe "create method", ->
  beforeEach ->
    @decking = new Decking

  describe "with stubbed configuration", ->
    beforeEach ->
      @stub = sinon.stub require("fs"), "readFileSync", ->
        JSON.stringify
          containers:
            test: "image"
          clusters:
            foo: ["test"]

    afterEach ->
      @stub.restore()

    describe.skip "when invoked", ->
      beforeEach (done) ->
        @decking.command = "create"
        @decking.execute done

      it "works", ->
        expect(0).to.eql 1
