# decking—simplified management for clusters of Docker containers

Decking aims to simplify the creation, management and running of clusters
of Docker containers in a way which is familiar to developers;
by reading information from a `decking.json` package file
on a project by project basis.

It simplifies the building of images based on local Dockerfiles which can ordinarily be a time-consuming and error prone process (building the wrong Dockerfile as the wrong image, and having to move the Dockerfile to the root of a project in order to make the `ADD` directive work properly).

It simplifies the creation of containers by considering `docker run` parameters to be part of the definition of each
container - again meaning less room for error as each developer doesn't have to remember the correct run time parameters to use when creating each container.

It simplifies the running of containers by allowing dependencies to be specified, ensuring that all containers forming
part of a cluster are started in the correct order such that `-link` parameters work as expected. Entire clusters of containers can be started, stopped or attached to with a single command, without having to worry about restarting them in dependency order.

It intends to use the Docker Remote API wherever possible (not everywhere, does
not appear to support `-name` and `-link` flags yet).

Please view [this showterm recording](http://showterm.io/21bc0f5d5ddbe4a1c4f2a) of decking in action as used by [makeusabrew/nodeflakes](https://github.com/makeusabrew/nodeflakes) (check out its [decking.json](https://github.com/makeusabrew/nodeflakes/blob/master/decking.json) definition for full details).

## Installation

Be warned: decking is *very* rough around the edges at the moment. If you want to get stuck in
then just clone the repository and run `./bin/decking` - it'll display the most up-to-date
list of commands (which might not be the same as those listed below). You'll need CoffeeScript
to run the executable. Alternatively, you can install the latest version published on npm:

```sudo npm install -g decking```

Note that the 0.0.x releases on npm are likely to be pretty unstable!

## Methods

**build (image | all)** - alleviate the inconvenience of ADD requiring a local (./ downwards)
context and ensure error-free mapping of Dockerfiles to image names.

**create (cluster)** - create a cluster of containers based on parameters found in the decking.json file. Dependencies can be specified which will ensure containers used as `-link` parameters exist before creation of their dependents.

**start (cluster)** - start a cluster (must call `create` first - for now). Dependencies are started first so `-link`s work properly

**stop (cluster)** - stop a cluster

**restart (cluster)** - restart a cluster

**status (cluster)** - show the status of each container in a cluster (started / stopped / non-existent)

**attach (cluster)** - multiplex the output from all running containers in a cluster into one stdout / stderr stream. Automatically re-attaches if a container stops but comes back within 10 seconds.

If you only have one cluster definition in your decking.json file (see below) then `<cluster>` may be omitted, meaning in practice you can usually simply type `decking start`, `decking stop` etc.

## decking.json format

### images (Object)

Each key is the name of the image you want to build. Each value is the location of
the *local* Dockerfile relative to the project root. That's right; only local images
can be built at the moment, although eventually you'll be able to specify tag names
to build an image from the Docker Index instead.

```
"images": {
  "makeusabrew/nodeflakes": "./docker/base",
  "makeusabrew/nodeflakes-server": "./docker/server",
  "makeusabrew/nodeflakes-consumer": "./docker/consumer",
  "makeusabrew/nodeflakes-processor": "./docker/processor"
}
```

When building an image the relevant Dockerfile will be copied to the root of your project (i.e. to the same level as your decking.json file) such that any `ADD` directives will be relative to your project root (which in my experience, or at least how I use Dockerfiles, is always the desired behaviour).

### containers (Object)

Keys are the names you want to run your images as (e.g. `docker run -name <key> ...`). Values are either a string - in which case they must refer to a valid `images` key - or an object. A definition of two containers demonstrating both approaches might look a bit like this:

```
"containers": {
  "nfprocessor": {
    "image": "makeusabrew/nodeflakes-processor",  // must exist in images object
    "port" : ["1234:1234"],
    "env": : ["MY_ENV_VAR=value", "ANOTHER_VAR=-"]
    "dependencies": [
      "nfconsumer:consumer"
    ],
    "mount": ["/path/to/host-dir:/path/to/container-dir"]
  },
  "nfconsumer": "makeusabrew/nodeflakes-consumer"  // shorthand, this container requires no other run args
}
```

Each key in the definition of `nfprocessor` maps loosely onto an argument which will be passed to `docker run`:

* port -> `-p`
* env -> `-e`
* dependencies -> `-link`
* mount -> `-v`
* image -> supplied as-is as the last part of the run command

It might be simpler to remove this abstraction and just name these keys exactly as per the arguments passed to docker run, but you'd end up with some pretty ugly looking definitions full of single letter keys. Nevertheless, this *may* change.

Notice that our env var `ANOTHER_VAR` is defined simply as `-`. This is a special value which, when the container is first created, will be substituted with the current value of `process.env['ANOTHER_VAR']`. If that yields a falsy value the user will be prompted for it. **Please note** that you will only be prompted for any missing environment variables *once* when calling `decking create <cluster>`. Of course, if you manually `docker rm` a container used in the cluster and then call `decking create <cluster>` again you will be prompted for the value once more.

### clusters (Object)

Keys are the names of clusters you want to refer to, values are just arrays of keys found in the `containers` object. These definitions are simple as most of the configuration has already been done:

```
"clusters": {
  "main": ["nfprocessor", "nfconsumer"]
}
```

Note that the order we list our containers as part of each cluster definition doesn't matter - decking will resolve the dependencies based on each container's definition and make sure they start in the correct order.

As we have only defined one cluster we can omit it when calling any of the main decking commands - e.g. `decking start main` can be shortened to `decking start`. If two or more cluster definitions are present then a cluster name must always be provided.

### groups (optional Object)

Groups allow clusters of containers to be run with different parameters. For example:

```
"groups": {
    "build": {
        "options": {
            "env":   ["NODE_ENV=build"],
            "mount": [".:/path/to/src"]
        }
    },
    "containers": {
        "nfprocessor": {
            "port": ["4321:1234"]
        }
    }
}
```

The above would create a new group called `build`, which when used would apply the relevant options
when creating a cluster of containers. Per-container overrides can also be set, though these are
optional. Opting into a group simply requires a slightly different cluster definition:

```
"clusters": {
  "main": ["nfprocessor", "nfconsumer"],
  "dev": {
      "group": "build",
      "containers": ["nfprocessor", "nfconsumer"]
  }
}
```

This would let us run two clusters based on the same containers, albeit one very clearly in
a 'build' mode. Of course we can't have two containers with different configurations sharing
the same `-name`, so decking namespaces containers based on the group name. In the above example,
a call to `decking create dev` would look for containers named `nfprocessor.build` and
`nfconsumer.build`. This namespacing is transparent to a user, meaning containers can always
be thought of and referred to (i.e. as dependencies) by their original name.

Note that for now, group-wide options completely overwrite any previous values for matching keys
rather than merge them with existing ones. Likewise, a container-level override overwrites
any previous values (even those set at group level). This will be changed in future such that
options are merged properly in a predictable manner.

See [nodeflakes/decking.json](https://github.com/makeusabrew/nodeflakes/blob/master/decking.json) for a valid - albeit rather simple - decking.json file.

## TODO

* proper error checking - so many cases not handled at all, let alone gracefully
* implement optional building of parent images when given a flag
* allow container image to be omitted if other keys are present; fuzzy match on images object
* tests!
* rework all output to always show full container list and update lines as necessary
* provide options to exclude 'implicit' cluster deps on start/stop/create
* add 'destroy' method - with appropriate warnings
* only allow standard 'word' characters in container names
* ensure dependencies have actually started before starting children (i.e. check port / logs)
