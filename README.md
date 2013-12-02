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

None of the below are fully implemented yet, but they're the rough
roadmap for the short term future.

### build (image | all)

Alleviate the inconvenience of ADD requiring a local (./ downwards)
context.

Rebuild all parent images, or up to a level specified (e.g. --parents=1)

### create (container)

Take run args from package file if supplied in expected format.

Allow dependencies to be specified, e.g. containers used as links
will be created first such that they can be linked properly

### start (container)

Start a container (must call `create` first - for now)

### stop (container)

Stop a running container

### cluster (start | stop) [name]

Define groups of related containers which conceptually form part of
a cluster (containers must have been created first, for now)

### status

Simple shortcut for `docker ps`

## TODO

* proper error checking - so many cases not handled at all, let alone gracefully
* better method dependencies; e.g. cluster start should `create` missing containers
* implement optional building of parent images when given a flag
* cluster-level attach (e.g. a mutiplexed stream of `docker attach`)
* cluster start should resolve dependency graph to ensure containers are started in order
* better handling of env vars; allow some to be marked as not required, some to be interactive (e.g. prompt on create)
* allow `cluster status [name]` to just filter relevant containers' statuses
