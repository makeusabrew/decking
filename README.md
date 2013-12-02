# decking

## Project goals

(Update 2nd December 2013: these have changed somewhat!)

To simplify the creation, management and running of clusters
of Docker containers in a way which is familiar to developers;
by reading container information from a `decking.json` package file
on a project by project basis.

To use the Docker Remote API wherever possible (not everywhere, does
not appear to support -name and -link flags yet).

## Methods

None of the below are fully implemented yet, but they're the rough
roadmap for the short term future.

### build (image | all)

Alleviate the inconvenience of ADD requiring a local (./ downwards)
context.

Rebuild all parent images, or up to a level specified (e.g. --parents=1)

### run (container)

Take run args from package file if supplied in expected format.

### cluster (start | stop) [name]

Define groups of related containers which conceptually form part of
a cluster.

Allow dependencies to be specified, e.g. containers used as links
can be started in advance.

### status

Simple shortcut for `docker ps`
