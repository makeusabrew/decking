
// Dependencies
var _ = require("lodash");
var util = require("util");

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
    details["mount-from"] = details["mount-from"] || [];
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

    // Loop over the "mountFrom" dependencies and validate they exist
    details["mount-from"].forEach(function(mountFrom, key) {
      if(!config.containers[mountFrom]) {
        throw new Error(
          "'mount-from' dependency '" + mountFrom + "' of container '" + name + "' does not exist!"
        );
      }
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
        "Cluster '" + name + "' references invalid group '" + details.group + "'"
      );
    }

    // no group, but does the key match one? If so use it
    if(!details.group && config.groups[name]) {
      details.group = name;
    }

    if(!details.containers.length) {
      throw new Error("Cluster '" + name + "' is empty");
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
        container.count = parseInt(matches[2], 10);
      }

      container.object = config.containers[container.name];
      if(!container.object) {
        throw new Error("Container '" + container.name + "' does not exist");
      }

      // If the container is multi-node, make sure nothing is trying to use it
      // with a "mount-from". The same volume will exist in each node, overwriting
      // it each time until only the last node is actually mounted
      if(container.count > 1) {
        var match = _.findKey(config.containers, function(containerObject) {
          return containerObject["mount-from"].indexOf(container.name) != -1;
        });
        if(match) {
          throw new Error("Container '" + container.name + "' can not mount-from multi-node container '" + match + "'");
        }
      }
    });
  });

  return config;
}

// ----------

module.exports = new Parser();
