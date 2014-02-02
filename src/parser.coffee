module.exports =
  load: (config) ->
    if not Object.keys(config.containers || {}).length
      throw new Error "No containers defined!"

    if not Object.keys(config.clusters || {}).length
      throw new Error "No clusters defined!"

    if not Object.keys(config.groups || {}).length
      config.groups = {}

    if not Object.keys(config.images || {}).length
      config.images = {}

    for name, details of config.containers
      if typeof details is "string"
        details = config.containers[name] =
          image: details

      details.name = name

      details.dependencies ?= []
      details.aliases = []

      for dependency,i in details.dependencies
        # it's nicer for rest of the app to work with dependencies and alises
        # as separate arrays
        [name, alias] = dependency.split ":"

        alias = name if not alias # if we didn't get dep:alias, assume dep:dep

        if not config.containers[name]?
          err = "Dependency '#{name}' of container '#{details.name}' does not exist!"
          throw new Error err

        details.dependencies[i] = name
        details.aliases[i] = alias

    for name, details of config.clusters
      # convert shorthand of list of containers
      if Array.isArray details
        details = config.clusters[name] =
          containers: details

      # explicit group; check it exists
      if details.group and not config.groups[details.group]
        err = "Cluster #{name} references invalid group #{details.group}"
        throw new Error err

      # no group, but does the key match one? If so use it
      if not details.group and config.groups[name]
        details.group = name

      throw new Error "Cluster #{name} is empty" if not details.containers.length

      # right, check out each container in the cluster
      for container, index in details.containers
        if typeof container is "string"
          container = details.containers[index] =
            name: container
            count: 1

        # allow multi-node containers to be defined as name(n)
        matches = container.name.match(/(.+)\((\d+)\)$/)
        [_, container.name, container.count] = matches if matches

        containerLookup = config.containers[container.name]

        if not containerLookup
          throw new Error("Container #{container.name} does not exist")

        container.object = containerLookup

    return config
