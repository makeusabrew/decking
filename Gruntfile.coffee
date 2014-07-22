module.exports = (grunt) ->

  grunt.loadNpmTasks "grunt-simple-mocha"

  grunt.initConfig
    simplemocha:
      options:
        reporter: "spec"

      all:
        src: ["test/**/*.js"]

  grunt.registerTask "test", ["simplemocha:all"]