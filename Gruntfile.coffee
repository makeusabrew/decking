module.exports = (grunt) ->

  grunt.loadNpmTasks "grunt-simple-mocha"

  grunt.initConfig
    simplemocha:
      options:
        reporter: "spec"

      all:
        src: ["test/**/*.coffee"]

  grunt.registerTask "test", ["simplemocha:all"]