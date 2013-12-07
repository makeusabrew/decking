# decking

## Project goals

(Update 2nd December 2013: these have changed somewhat!)

To simplify the creation, management and running of clusters
of Docker containers in a way which is familiar to developers;
by reading container information from a `decking.json` package file
on a project by project basis.

To use the Docker Remote API wherever possible (not everywhere, does
not appear to support -name and -link flags yet).

See [nodeflakes/decking.json](https://github.com/makeusabrew/nodeflakes/blob/master/decking.json)
for a *very* rough example!

## Installation

Don't yet - decking is too unstable at the moment.

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

## TODO

* proper error checking - so many cases not handled at all, let alone gracefully
* better method dependencies; e.g. cluster start should `create` missing containers
* implement optional building of parent images when given a flag
* cluster-level attach (e.g. a mutiplexed stream of `docker attach`)
* allow container image to be omitted if other keys are present; fuzzy match on images object
* tests!
* allow shortcut if no explicit cluster specified, default to first key
* rework all output to always show full container list and update as necessary
