module.exports = (grunt) ->
  grunt.registerTask "compile", ->
    done = @async()
    exec = require("child_process").exec
    exec "coffee -c -o lib/ src/", done

  grunt.registerTask "default", "compile"
