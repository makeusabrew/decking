#!/usr/bin/env node
var Decking, colors, d, decking, domain, options;

domain = require("domain");

colors = require("colors");

Decking = require("../index.coffee");

options = {
  command: process.argv[2],
  args: process.argv.slice(3)
};

decking = new Decking(options);

d = domain.create();

d.on("error", function(e) {
  return console.log(e.stack.red);
});

d.run(function() {
  return setImmediate(function() {
    return decking.execute();
  });
});
