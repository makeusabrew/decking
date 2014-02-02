chai   = require "chai"
expect = chai.expect
sinon  = require "sinon"

chai.use require("sinon-chai")

Decking = require "../src/decking"

describe "Decking", ->
  it "is a function", ->
    expect(Decking).to.be.a.function

  describe "When invoked", ->
    describe "Without any options", ->
      beforeEach ->
        @decking = new Decking

      it "returns an object", ->
        expect(@decking).to.be.an.object

      it "has no command property", ->
        expect(@decking.command).to.be.undefined

      it "has an empty arguments array", ->
        expect(@decking.args).to.eql []

    describe "With a command option", ->
      beforeEach ->
        @decking = new Decking command: "foo"

      it "has the correct command property", ->
        expect(@decking.command).to.eql "foo"

      it "has an empty arguments array", ->
        expect(@decking.args).to.eql []

    describe "With an args option", ->
      beforeEach ->
        @decking = new Decking args: ["foo"]

      it "has no command property", ->
        expect(@decking.command).to.be.undefined

      it "has an empty arguments array", ->
        expect(@decking.args).to.eql ["foo"]

    describe "With both options", ->
      beforeEach ->
        @decking = new Decking command: "foo", args: ["bar"]

      it "has the correct command property", ->
        expect(@decking.command).to.eql "foo"

      it "has an empty arguments array", ->
        expect(@decking.args).to.eql ["bar"]

describe "Instance methods", ->
  describe "execute", ->
    beforeEach ->
      @decking = new Decking

      @execute = (cmd = null) ->
        @decking.command = cmd
        @decking.execute()

    describe "Given a stubbed help method", ->
      beforeEach ->
        @stub = sinon.stub @decking.commands, "help"

      afterEach ->
        @stub.restore()

      describe "with no command", ->
        beforeEach ->
          @execute()

        it "should invoke the help method", ->
          expect(@stub).to.have.been.called

      describe "with -h", ->
        beforeEach ->
          @execute "-h"

        it "should invoke the help method", ->
          expect(@stub).to.have.been.called

      describe "with --help", ->
        beforeEach ->
          @execute "--help"

        it "should invoke the help method", ->
          expect(@stub).to.have.been.called

    describe "with an unknown command", ->
      beforeEach ->
        try
          @execute "foo"
        catch e
          @e = e

      it "throws the expected error", ->
        expect(@e.message).to.eql "Unknown method foo"

    describe "with no local decking.json file", ->
      beforeEach ->
        try
          @execute "create"
        catch e
          @e = e

      it "throws the expected error", ->
        expect(@e.message).to.eql "ENOENT, no such file or directory './decking.json'"
