# decking

## Project goals

To simplify the creation, management and running of clusters
of Docker containers in a way which is familiar to developers;
by reading container information from a `decking.json` package file
on a project by project basis.

To use the Docker Remote API wherever possible (not everywhere, does
not appear to support -name and -link flags yet).

See [nodeflakes/decking.json](https://github.com/makeusabrew/nodeflakes/blob/master/decking.json)
for a *very* rough example!

## Installation

Not advised yet - decking is too unstable at the moment. If you want to get stuck in
then just clone the repository and run `./bin/decking` - it'll display the most up-to-date
list of commands (which might not be the same as those listed below). You'll need CoffeeScript
until the module is properly published on npm.

## Methods

### build (image | all)

Alleviate the inconvenience of ADD requiring a local (./ downwards)
context.

Rebuild all parent images, or up to a level specified (e.g. --parents=1)

### create (cluster)

Take run args from package file if supplied in expected format.

Allow dependencies to be specified, e.g. containers used as links
will be created first such that they can be linked properly

### start (cluster)

Start a cluster (must call `create` first - for now)

### stop (cluster)

Stop a running cluster

### status (cluster)

Show the status of a cluster's containers

### attach (cluster)

Attach to all running containers in the cluster. Needs a lot of work to
identify which container the output stream is coming from.

## decking.json

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

### containers (Object)

Keys are the names you want to run your containers as (e.g. `docker run -name <key>`). Values are either a string in which case they must refer to a valid `images` key or an object. A definition of two containers might look a bit like this:

```
"containers": {
  "container_name": {
    "image": "makeusabrew/nodeflakes-processor",  // must exist in images object
    "port" : ["1234:1234"],
    "env": : ["MY_ENV_VAR=value", "ANOTHER_VAR=-"]
    "dependencies": [
      "another_container:alias_name"
    ],
    "mount": ["host_dir:container_dir"]
  },
  "another_container": "makeusabrew/nodeflakes-consumer"
}
```

Each key in the definition of `container_name` maps loosely onto an argument which will be passed to `docker run`:

* port -> `-p`
* env -> `-e`
* dependencies -> `-link`
* mount -> `-v`
* image -> supplied verbatim as the last part of the run command

It might be simpler to remove this abstraction and just name them exactly as per the arguments as per those passed to docker run, but you'd end up with some pretty ugly looking definitions full of single letter keys. Still, this may change.

## TODO

* proper error checking - so many cases not handled at all, let alone gracefully
* better method dependencies; e.g. cluster start should `create` missing containers
* implement optional building of parent images when given a flag
* allow container image to be omitted if other keys are present; fuzzy match on images object
* tests!
* rework all output to always show full container list and update lines as necessary
* provide options to exclude 'implicit' cluster deps on start/stop/create
* add 'destroy' method - with appropriate warnings
* introduce concept of groups - allowing base container definitions to be merged with a group
  which can be run with different group-level params
