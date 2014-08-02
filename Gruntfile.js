
module.exports = function(grunt) {

  grunt.loadNpmTasks("grunt-simple-mocha");

  grunt.initConfig({
    simplemocha: {
      options: {
        reporter: "spec"
      },
      all: {
        src: ["test/**/*.js"]
      }
    }
  });

  grunt.registerTask("default", ["simplemocha:all"]);
};