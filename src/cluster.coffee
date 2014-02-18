DepTree = require "deptree"

module.exports =
  maxLength: 0

  # @TODO rename; this does more than just order resolution now!
  resolveContainers: (config, cluster, callback) ->
    if cluster.group
      # right! specifying a group modifier. let's pump it up...
      groupName = cluster.group
      group = config.groups[groupName]

    containers = []

    for container in cluster.containers
      # check for implicit members (unnamed container dependencies)
      for dependency in container.object.dependencies
        if not hasDependency cluster.containers, dependency
          container =
            name: dependency
            # if this dependency isn't named in the cluster it can't have a node
            # count, so give it the default...
            count: 1
            object: config.containers[dependency]
          cluster.containers.push container

    containers = cluster.containers

    # rename any containers based on group stuff, calc some max length stuff
    # merge group overrides if present
    # @TODO Cluster.mergeOverrides
    for container in containers
      container.originalName = container.name

      if groupName
        container.group = groupName
        # @FIXME stop overwriting the name property! create a separate variable
        # called instanceName or something. obj.name always wants to
        # be the 'canonical' name
        container.name += ".#{groupName}"

        # first up, completely replace any container config with
        # the group-wide options
        # @TODO merge instead of replace?
        for key, value of group.options
          container.object[key] = value

        # now check for container specific overrides...
        if group.containers?[container.originalName]?
          for key, value of group.containers[container.originalName]
            # @TODO we're overwriting here, these should MERGE with
            # those specified group-wide... I think. But only if there
            # was a group wide key maybe?
            container.object[key] = value

      # just used for formatting so we pad the container names equally
      length = container.name.length
      # this is a multi-node definition so we'll suffix it .(n) in a minute
      # we can't do it here because we don't have unique objects for each
      # n instance; we just have one canonical container at this point
      length += container.count.toString().length if container.count > 1
      module.exports.maxLength = length if length > module.exports.maxLength

    list = sortCluster containers

    # nearly there, we've got a flattened list, but we need to make sure we have
    # the correct number of nodes for each container
    # @TODO Cluster.xxx
    final = []
    for originalContainer in list
      for i in [1..originalContainer.count]
        # dirty clone!
        container = JSON.parse JSON.stringify originalContainer
        container.index = i
        container.name += ".#{i}" if container.count > 1
        final.push container

    callback final

sortCluster = (containers) ->
  # resolve dependency order
  depTree = new DepTree
  for container in containers
    depTree.add container.originalName, container.object.dependencies

  (findContainer(containers, item) for item in depTree.resolve())

hasDependency = (containers, dependency) ->
  return findContainer(containers, dependency) isnt null

findContainer = (containers, name) ->
  for container in containers
    # @TODO remove originalName hack
    return container if container.originalName is name or container.name is name

  return null
