async = require "async"

module.exports =
  getArg: (key, val, container, done) ->
    arg = []

    switch key
      when "env"
        # we need to loop through all the entries asynchronously
        # because if we get an ENV_VAR=- format (the key being -) then
        # we'll prompt for the value
        iterator = (v, callback) ->
          [key, value] = v.split "="

          # first thing's first, try and substitute a real process.env value
          if value is "-" then value = process.env[key]

          # did we have one? great! bail early with the updated value
          if value
            arg = [].concat arg, ["-e #{key}=#{value}"]
            return callback null

          # if we got here we still don't have a value for this env var, so
          # we need to ask the user for it
          options =
            prompt: "#{container.name} requires a value for the env var '#{key}':"
            silent: true
            replace: "*"

          require("read") options, (err, value) ->
            arg = [].concat arg, ["-e #{key}=#{value}"]
            return callback null

        return async.eachSeries val, iterator, (err) -> done err, arg

      when "dependencies"
        for v,k in val
          if container.group
            v += ".#{container.group}"
          # we trust that the aliases array has the correct matching indices
          # here such that alias[k] is the correct alias for dependencies[k]
          alias = container.object.aliases[k]
          arg = [].concat arg, ["-link #{v}:#{alias}"]

      when "port"
        arg = [].concat arg, ["-p #{v}"] for v in val

      when "privileged"
        arg = ["-privileged"] if val

      when "mount"
        for v in val
          [host, remote] = v.split ":"
          matches = host.match /^\.(.*)$/
          if matches
            path = require "path"
            host = path.join process.cwd(), matches[1]

          host = process.cwd() if host is "."
          arg = [].concat arg, ["-v #{host}:#{remote}"]

    return done null, arg
