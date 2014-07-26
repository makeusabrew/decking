
// Dependencies
var _ = require("lodash");

// ----------

function Parser() {}

Parser.prototype.load = function(config) {

  if(_.size(config.containers) === 0) {
    throw new Error("No containers defined!");
  }

  if(_.size(config.clusters) === 0) {
    throw new Error("No clusters defined!");
  }

  if(_.size(config.groups) === 0) {
    config.groups = {};
  }

  if(_.size(config.images) === 0) {
    config.images = {};
  }

  _.each(config.containers, function(details, name) {

    if(typeof details == "string") {
      details = config.containers[name] = {
        image: details
      };
    }

    details.dependencies = details.dependencies || [];
    details.aliases = [];

    details.dependencies.forEach(function(dependency, key) {

      // it's nicer for rest of the app to work with dependencies and alises
      // as separate arrays
      var parts = dependency.split(":");
      var dep = parts[0];
      var alias = parts[1];

      // if we didn't get dep:alias, assume dep:dep
      if(!alias) {
        alias = dep;
      }

      if(!config.containers[dep]) {
        throw new Error(
          "Dependency '" + dep + "' of container '" + name + "' does not exist!"
        );
      }

      details.dependencies[key] = dep;
      details.aliases[key] = alias;
    });

  });

  _.each(config.clusters, function(details, name) {

    // convert shorthand of list of containers
    if(_.isArray(details)) {
      details = config.clusters[name] = {containers: details};
    }

    // explicit group; check it exists
    if(details.group && !config.groups[details.group]) {
      throw new Error(
        "Cluster " + name + " references invalid group " + details.group
      );
    }

    // no group, but does the key match one? If so use it
    if(!details.group && config.groups[name]) {
      details.group = name;
    }

    if(!details.containers.length) {
      throw new Error("Cluster " + name + " is empty");
    }

    // right, check out each container in the cluster
    details.containers.forEach(function(container, index) {

      if(typeof container == "string") {
        container = details.containers[index] = {
          name: container,
          count: 1
        };
      }

      // allow multi-node containers to be defined as name(n)
      matches = container.name.match(/(.+)\((\d+)\)$/);
      if(matches) {
        container.name = matches[1];
        container.count = matches[2];
      }

      container.object = config.containers[container.name];
      if(!container.object) {
        throw new Error("Container " + container.name + " does not exist");
      }
    });
  });

  return config;
}

// ----------

module.exports = new Parser();
