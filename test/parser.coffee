chai   = require "chai"
expect = chai.expect
sinon  = require "sinon"
chai.use require("sinon-chai")

Parser = require "../src/parser"

describe "Parser", ->
  beforeEach ->
    @config = {}

  it "exposes the correct method", ->
    expect(Parser.load).to.be.a "function"

  describe "with no containers", ->
    beforeEach ->
      try
        Parser.load @config
      catch e
        @e = e

    it "throws the correct error", ->
      expect(@e.message).to.eql "No containers defined!"

  describe "with an empty containers object", ->
    beforeEach ->
      @config.containers = {}
      try
        Parser.load @config
      catch e
        @e = e

    it "throws the correct error", ->
      expect(@e.message).to.eql "No containers defined!"

  describe "with no clusters", ->
    beforeEach ->
      @config.containers = {"foo": "bar"}
      try
        Parser.load @config
      catch e
        @e = e

    it "throws the correct error", ->
      expect(@e.message).to.eql "No clusters defined!"

  describe "with an empty clusters object", ->
    beforeEach ->
      @config.containers = {"foo": "bar"}
      @config.clusters = {}
      try
        Parser.load @config
      catch e
        @e = e

    it "throws the correct error", ->
      expect(@e.message).to.eql "No clusters defined!"

  describe "with one empty cluster", ->
    beforeEach ->
      @config.clusters =
        baz: []
      @config.containers = {"foo": "bar"}
      try
        Parser.load @config
      catch e
        @e = e

    it "throws the correct error", ->
      expect(@e.message).to.eql "Cluster baz is empty"

  describe "basic container definition", ->
    beforeEach ->
      @config =
        containers: {}
        clusters:
          test: ["test"]

    describe "longhand notation", ->
      beforeEach ->
        @config.containers =
          test:
            image: "test/image"

        Parser.load @config

      it "assigns the correct image to the container", ->
        expect(@config.containers.test.image).to.eql "test/image"

      it "assigns an empty dependencies array to the container", ->
        expect(@config.containers.test.dependencies).to.eql []

      it "assigns an empty aliases array to the container", ->
        expect(@config.containers.test.aliases).to.eql []

    describe "shorthand notation", ->
      beforeEach ->
        @config.containers =
          test: "image/name"

        Parser.load @config

      it "assigns the correct image to the container", ->
        expect(@config.containers.test.image).to.eql "image/name"

  describe "dependency definitions", ->
    beforeEach ->
      @config =
        containers:
          dep1: "image/dep"
        clusters:
          test: ["test"]

    describe "when a listed dependency does not exist ", ->
      beforeEach ->
        @config.containers.test =
          image: "image/test"
          dependencies: ["invalid"]

        try
          Parser.load @config
        catch e
          @e = e

      it "throws the expected error", ->
        expect(@e.message).to.eql "Dependency 'invalid' of container 'test' does not exist!"

    describe "when a listed dependency exists", ->

      describe "when not specifying an alias", ->
        beforeEach ->
          @config.containers.test =
            image: "image/test"
            dependencies: ["dep1"]

          Parser.load @config

        it "populates the container's dependencies correctly", ->
          expect(@config.containers.test.dependencies).to.eql ["dep1"]

        it "populates the container's aliases correctly", ->
          expect(@config.containers.test.aliases).to.eql ["dep1"]

      describe "when specifying an alias", ->
        beforeEach ->
          @config.containers.test =
            image: "image/test"
            dependencies: ["dep1:alias1"]

          Parser.load @config

        it "populates the container's dependencies correctly", ->
          expect(@config.containers.test.dependencies).to.eql ["dep1"]

        it "populates the container's aliases correctly", ->
          expect(@config.containers.test.aliases).to.eql ["alias1"]

  describe "basic cluster definition", ->
    beforeEach ->
      @config =
        containers:
          test: "image/name"

    describe "when a container referenced by the cluster does not exist", ->
      beforeEach ->
        @config.clusters =
          cluster:
            containers: ["invalid"]

        try
          Parser.load @config
        catch e
          @e = e

      it "throws the expected error", ->
        expect(@e.message).to.eql "Container invalid does not exist"

    describe "longhand notation", ->
      beforeEach ->
        @config.clusters =
          cluster:
            containers: ["test"]

        Parser.load @config

      it "assigns the correct containers to the cluster", ->
        expect(@config.clusters.cluster.containers).to.be.an "array"
        expect(@config.clusters.cluster.containers).to.have.lengthOf 1

      it "assigns the correct name to the cluster's container", ->
        expect(@config.clusters.cluster.containers[0].name).to.eql "test"

      it "assigns the correct initial count to the cluster's container", ->
        expect(@config.clusters.cluster.containers[0].count).to.eql 1

      it "assigns an object property to the cluster's container", ->
        expect(@config.clusters.cluster.containers[0].object).to.be.an "object"

    describe "shorthand notation", ->
      beforeEach ->
        @config.clusters =
          cluster: ["test"]

        Parser.load @config

      it "assigns the correct containers to the cluster", ->
        expect(@config.clusters.cluster.containers).to.be.an "array"
        expect(@config.clusters.cluster.containers).to.have.lengthOf 1
