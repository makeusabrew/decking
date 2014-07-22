
// Dependencies
var _ = require("lodash");
var DepTree = require("deptree");

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
  if(cluster.group) {
    // right! specifying a group modifier. let's pump it up...
    groupName = cluster.group;
    group = config.groups[groupName];
  }

  var self = this;
  cluster.containers.forEach(function(container) {
    container.object.dependencies.forEach(function(dependency) {
      if(!self.hasDependency(cluster.containers, dependency)) {
        // @FIXME Does this variable collide with "container" above on purpose?
        container = {
          name: dependency,
          // if this dependency isn't named in the cluster it can't have a node
          // count, so give it the default...
          count: 1,
          object: config.containers[dependency]
        };
        cluster.containers.push(container);
      }
    });
  });

  var containers = cluster.containers;

  // rename any containers based on group stuff, calc some max length stuff
  // merge group overrides if present
  // @TODO Cluster.mergeOverrides
  containers.forEach(function(container) {
    container.originalName = container.name;
    if(groupName) {
      container.group = groupName;
      // @FIXME stop overwriting the name property! create a separate variable
      // called instanceName or something. obj.name always wants to
      // be the 'canonical' name
      container.name += "." + groupName;

      // first up, completely replace any container config with
      // the group-wide options
      // @TODO merge instead of replace?
      _.assign(container.object, group.options);

      // now check for container specific overrides...
      if(group.containers && group.containers[container.originalName]) {
        // @TODO we're overwriting here, these should MERGE with
        // those specified group-wide... I think. But only if there
        // was a group wide key maybe?
        _.assign(container.object, group.containers[container.originalName]);
      }
    }
  });

  var list = this.sortCluster(containers);

  // nearly there, we've got a flattened list, but we need to make sure we have
  // the correct number of nodes for each container
  // @TODO Cluster.xxx
  var final = [];
  list.forEach(function(originalContainer) {
    for(var i = 1; i <= originalContainer.count; i++) {
      // dirty clone!
      var container = JSON.parse(JSON.stringify(originalContainer));
      container.index = i;
      if (container.count > 1) {
        container.name += "." + i;
      }
      final.push(container);
    }
  });

  return callback(null, final);
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
    depTree.add(container.originalName, container.object.dependencies);
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
    return container.originalName == name && container.name == name;
  });
};

// ----------

module.exports = new Cluster();