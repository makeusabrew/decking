# decking—simplified management for clusters of Docker containers
Decking aims to simplify the creation, organsation and running of clusters
of Docker containers in a way which is familiar to developers; by reading
information from a `decking.json` package file on a project by
project basis.

## Installation

```[sudo] npm install -g decking```

While the project is under heavy development, the best place to find
the most up-to-date documentation is [decking.io](http://decking.io).

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
