
// Dependencies
var _ = require("lodash");
var util = require("util");

// ----------

function Parser() {}

Parser.prototype.load = function(config) {

  /**
   * Set up some sensible defaults if not
   * present; avoids some tedious conditional
   * checking later on
   */
  if (_.size(config.containers) === 0) {
    throw new Error("No containers defined!");
  }

  if (_.size(config.clusters) === 0) {
    throw new Error("No clusters defined!");
  }

  if (_.size(config.groups) === 0) {
    config.groups = {};
  }

  if (_.size(config.images) === 0) {
    config.images = {};
  }

  /**
   * Iterate through the containers first, again fleshing
   * out sensible defaults if not present and converting
   * any shorthands into proper objects
   */
  _.each(config.containers, function(details, name) {

    if (typeof details === "string") {
      // shorthand of "key": "imageName"
      details = config.containers[name] = {
        image: details
      };
    }

    details.dependencies = details.dependencies || [];
    details["mount-from"] = details["mount-from"] || [];
    details.aliases = [];

    details.dependencies.forEach(resolveDependencies(config, details, name));

    // Loop over the "mountFrom" dependencies and validate they exist
    details["mount-from"].forEach(function(mountFrom) {
      if(!config.containers[mountFrom]) {
        throw new Error(
          "'mount-from' dependency '" + mountFrom + "' of container '" + name + "' does not exist!"
        );
      }
    });

  });

  /**
   * Next up loop through clusters, sanitising them and
   * converting shorthands
   */
  _.each(config.clusters, function(details, name) {

    // convert shorthand of list of containers
    if (_.isArray(details)) {
      details = config.clusters[name] = {
        containers: details
      };
    }

    // explicit group; check it exists
    if (details.group && !config.groups[details.group]) {
      throw new Error(
        "Cluster '" + name + "' references invalid group '" + details.group + "'"
      );
    }

    // no group, but does the key match one? If so opt-in to that group implicitly
    // This may look a bit surprising, but it fits the vast majority of use cases
    // where a cluster represents an environment (e.g. dev, test) and that environment
    // has overrides.
    // It's documented and easy to avoid; just don't name clusters the same as groups,
    // or use the longhand and declare their group property manually
    if (!details.group && config.groups[name]) {
      details.group = name;
    }

    if (!details.containers.length) {
      throw new Error("Cluster '" + name + "' is empty");
    }

    // right, check out each container in the cluster
    details.containers.forEach(function(container, index) {

      if (typeof container === "string") {
        container = details.containers[index] = {
          name: container,
          count: 1
        };
      }

      // allow multi-node containers to be defined as name(n)
      // @TODO edge case, but if a user declares the container
      // longhand specifying count: N but name: foo(N+1), the count
      // will be taken as N+1
      matches = container.name.match(/(.+)\((\d+)\)$/);
      if (matches) {
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
      if (container.count > 1) {
        var match = _.findKey(config.containers, function(containerObject) {
          return containerObject["mount-from"].indexOf(container.name) != -1;
        });
        if (match) {
          throw new Error("Container '" + container.name + "' can not mount-from multi-node container '" + match + "'");
        }
      }
    });
  });

  /**
   * What about groups? No shorthands here, but we might have to do some sanitisation
   * of dependencies
   */
  _.each(config.groups, function(group, name) {

    // sanitise first...
    if(_.size(group.options) === 0) {
      group.options = {};
    }

    if(_.size(group.containers) === 0) {
      group.containers = {};
    }

    // but follow up; we need at least options OR containers...
    if (_.size(group.options) === 0 && _.size(group.containers) === 0) {
      throw new Error("Group '" + name + "' specifies no containers or options");
    }

    // unlike other definitions, we don't want to set empty properties on groups
    // since that would cause them to override container settings with empty values
    // as such we need a bit more conditional checking
    if (_.size(group.options.dependencies)) {
      // okay, we *do* have dependencies, so we're safe to attach an aliases property
      // to accompany it, since aliases is a strictly internal concept which users
      // shouldn't be declaring
      group.options.aliases = [];
      group.options.dependencies.forEach(resolveDependencies(config, group.options, name));
    }

    _.each(group.containers, function(container, name) {
      container.aliases = [];
      if (_.size(container.dependencies)) {
        container.dependencies.forEach(resolveDependencies(config, container, name));
      }
    });
  });

  return config;
};

/**
 * private
 */
function resolveDependencies(config, object, name) {
  return function resolveDependency(dependency, key) {
    // it's nicer for rest of the app to work with dependencies and aliases
    // as separate arrays
    var parts = dependency.split(":");
    var dep = parts[0];
    var alias = parts[1];

    // if we didn't get dep:alias, assume dep:dep
    if (!alias) {
      alias = dep;
    }

    if (!config.containers[dep]) {
      throw new Error(
        "Dependency '" + dep + "' of container '" + name + "' does not exist!"
      );
    }

    // key is really important here; we rely on alias(N) === dependency(N)
    object.dependencies[key] = dep;
    object.aliases[key] = alias;
  };
}

// ----------

module.exports = new Parser();
