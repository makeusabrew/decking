
// Dependencies
var _ = require("lodash");
var DepTree = require("deptree");
var util = require("util");

// ----------

function Cluster() {}

// ----------

/**
 * @param {Object} config
 * @param {Object} cluster
 * @param {Function} callback
 *
 * @TODO rename; this does more than just order resolution now!
 */
Cluster.prototype.resolveContainers = function(config, cluster, callback) {

  var groupName = null;
  var group = null;
  if (cluster.group) {
    // right! specifying a group modifier. let's pump it up...
    groupName = cluster.group;
    group = config.groups[groupName];
  }

  var self = this;
  var implicitDependencies = [];
  cluster.containers.forEach(function(container) {

    // Assign the group config
    if(group) {
      self.assignGroupConfig(container, group);
    }

    // We now have 2 different types of "dependencies" for order resolution.
    // "dependencies" for "--link", and "mount-from" for "--volumes-from".
    // Combine both into a single array for resolution
    var dependencies = _.union(
      container.object.dependencies,
      container.object["mount-from"]
    );

    dependencies.forEach(function(dependency) {
      if(!self.hasDependency(cluster.containers, dependency)) {

        var containerObject = config.containers[dependency];
        if(group) {
          self.assignGroupConfig(containerObject, group);
        }

        implicitDependencies.push({
          name: dependency,
          // if this dependency isn't named in the cluster it can't have a node
          // count, so give it the default...
          count: 1,
          object: containerObject
        });
      }
    });
  });

  var containers = _.union(cluster.containers, implicitDependencies);

  // rename any containers based on group stuff, calc some max length stuff
  // merge group overrides if present
  // @TODO Cluster.mergeOverrides
  //
  containers.forEach(function(container) {
    container.originalName = container.name;
    if(groupName) {
      container.group = groupName;
      // @FIXME stop overwriting the name property! create a separate variable
      // called instanceName or something. obj.name always wants to
      // be the 'canonical' name
      container.name += "." + groupName;
    }
  });

  var list = this.sortCluster(containers);
  var finalList = this.addNodes(list);

  // nearly there, we've got a flattened list, but we need to make sure we have
  // the correct number of nodes for each container
  // @TODO Cluster.xxx

  return callback(null, finalList);
}

Cluster.prototype.addNodes = function(containers) {

  var list =_.map(containers, function(originalContainer) {

    var nodeCount = originalContainer.count;
    var nodes = [];

    for(var i = 1; i <= nodeCount; i++) {
      // if we don't clone here we'll modify each
      // node's name
      var container = _.cloneDeep(originalContainer);
      container.index = i;

      // if there's only one node don't bother adding the
      // extra level of namespacing
      if (nodeCount > 1) {
        container.name += "." + i;
      }

      nodes.push(container);
    }

    return nodes;
  });

  return _.flatten(list);
};

Cluster.prototype.assignGroupConfig = function(container, group) {

  // first up, completely replace any container config with
  // the group-wide options
  // @TODO merge instead of replace?
  _.assign(container.object, group.options);

  // @FIXME this silently ignores override keys which aren't in
  // the container list; can be very hard to track down!

  // now check for container specific overrides...
  if(group.containers && group.containers[container.name]) {
    // @TODO we're overwriting here, these should MERGE with
    // those specified group-wide... I think. But only if there
    // was a group wide key maybe?
    _.assign(container.object, group.containers[container.name]);
  }
}

/**
 * @param {Array} containers
 *
 * @return {Array}
 */
Cluster.prototype.sortCluster = function(containers) {

  // resolve dependency order
  var depTree = new DepTree;
  containers.forEach(function(container) {
    depTree.add(container.originalName, _.union(container.object.dependencies, container.object['mount-from']));
  });

  var self = this;
  var results = [];
  var sortedCluster = depTree.resolve();
  sortedCluster.forEach(function(item) {
    results.push(self.findContainer(containers, item));
  });

  return results;
};

/**
 * @param {Array} containers
 * @param {String} dependency
 *
 * @return {Boolean}
 */
Cluster.prototype.hasDependency = function(containers, dependency) {
  return this.findContainer(containers, dependency) != null;
};

/**
 * @param {Array} containers
 * @param {String} name
 *
 * @return {Object}
 */
Cluster.prototype.findContainer = function(containers, name) {
  return _.find(containers, function(container) {
    // @TODO remove originalName hack
    return container.originalName == name || container.name == name;
  });
};

// ----------

module.exports = new Cluster();
