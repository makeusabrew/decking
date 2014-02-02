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

            setTimeout ->
              process.stdin.write "foo\r\n"
            , 100

          it "transforms the values correctly", ->
            expect(@arg).to.eql ["-e ENV1=input", "-e ENV2=val2"]

  describe "dependencies", ->
    describe "with no group override", ->
      beforeEach (done) ->
        object =
          aliases: ["dep1", "alias2"]
        Runner.getArg "dependencies", ["dep1", "dep2"], object, (err, @arg) => done()

      it "transforms the values correctly", ->
        expect(@arg).to.eql ["-link dep1:dep1", "-link dep2:alias2"]

    describe "with a group override", ->
      beforeEach (done) ->
        object =
          group: "dev"
          aliases: ["dep1", "alias2"]
        Runner.getArg "dependencies", ["dep1", "dep2"], object, (err, @arg) => done()

      it "applies the correct container namespace to each link", ->
        expect(@arg).to.eql ["-link dep1.dev:dep1", "-link dep2.dev:alias2"]

  describe "port", ->
    beforeEach (done) ->
      Runner.getArg "port", ["8080:8080", "8888"], {}, (err, @arg) => done()

    it "transforms the values correctly", ->
      expect(@arg).to.eql ["-p 8080:8080", "-p 8888"]

  describe "privileged", ->
    describe "when falsy", ->
      beforeEach (done) ->
        Runner.getArg "privileged", false, {}, (err, @arg) => done()

      it "does not apply the flag", ->
        expect(@arg).to.eql []

    describe "when truthy", ->
      beforeEach (done) ->
        Runner.getArg "privileged", true, {}, (err, @arg) => done()

      it "applies the flag", ->
        expect(@arg).to.eql ["-privileged"]

  describe "mount", ->
    describe "with string literals", ->
      beforeEach (done) ->
        Runner.getArg "mount", ["/path/to/host:/path/to/container"], {}, (err, @arg) => done()

      it "transforms the values correctly", ->
        expect(@arg).to.eql ["-v /path/to/host:/path/to/container"]

    describe "with the special dot value", ->
      beforeEach (done) ->
        Runner.getArg "mount", [".:/path/to/container"], {}, (err, @arg) => done()

      it "replaces the dot with the current working directory", ->
        expect(@arg).to.eql ["-v #{process.cwd()}:/path/to/container"]

    describe "with the special dot value at the start of the string", ->
      beforeEach (done) ->
        Runner.getArg "mount", ["./test:/path/to/container"], {}, (err, @arg) => done()

      it "replaces the dot but keeps the path after it", ->
        expect(@arg).to.eql ["-v #{process.cwd()}/test:/path/to/container"]

    describe "with the dot value anywhere else in string", ->
      beforeEach (done) ->
        Runner.getArg "mount", ["/path/to/.ssh:/path/to/container"], {}, (err, @arg) => done()

      it "does not replace the dot value", ->
        expect(@arg).to.eql ["-v /path/to/.ssh:/path/to/container"]
