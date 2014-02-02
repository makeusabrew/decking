module.exports = (grunt) ->

  grunt.loadNpmTasks "grunt-simple-mocha"

  grunt.initConfig
    simplemocha:
      options:
        reporter: "spec"

      all:
        src: ["test/**/*.coffee"]

  grunt.registerTask "test", ["simplemocha:all"]
  grunt.registerTask "compile", ->
    done = @async()
    exec = require("child_process").exec
    exec "coffee -c -o lib/ src/", done

  grunt.registerTask "default", "compile"
