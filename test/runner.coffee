chai   = require "chai"
expect = chai.expect
sinon  = require "sinon"
chai.use require("sinon-chai")

Runner = require "../src/runner"

describe "Runner", ->

  it "exposes the correct method", ->
    expect(Runner.getArg).to.be.a "function"

  describe "env", ->
    describe "with static values", ->
      beforeEach (done) ->
        Runner.getArg "env", ["ENV1=val1", "ENV2=val2"], {}, (err, @arg) => done()

      it "transforms the values correctly", ->
        expect(@arg).to.eql ["-e ENV1=val1", "-e ENV2=val2"]

    describe "with a dynamic value", ->

      describe "where the host has a valid environment variable for the given key", ->
        beforeEach (done) ->
          process.env["ENV1"] = "test"

          Runner.getArg "env", ["ENV1=-", "ENV2=val2"], {}, (err, @arg) => done()

        afterEach ->
          delete process.env["ENV1"]

        it "transforms the values correctly", ->
          expect(@arg).to.eql ["-e ENV1=test", "-e ENV2=val2"]

      describe "where the host does not have a valid environment variable", ->
        describe.skip "Given a stubbed user response", ->
          beforeEach (done) ->

            Runner.getArg "env", ["ENV1=-", "ENV2=val2"], {}, (err, @arg) => done()

          it "transforms the values correctly", ->
            expect(@arg).to.eql ["-e ENV1=input", "-e ENV2=val2"]
