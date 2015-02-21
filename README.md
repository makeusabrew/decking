# decking—simplified management for clusters of Docker containers

Decking aims to simplify the creation, organsation and running of clusters
of Docker containers in a way which is familiar to developers; by reading
information from a `decking.json` package file on a project by
project basis.

## Installation

```[sudo] npm install -g decking```

While the project is under development the best place to find
the most up-to-date documentation is [decking.io](http://decking.io).

## Latest Release: 0.4.0

* Add `--as` CLI option to suport arbitrary group aliases
* Add `ready` container parameter to signal when service has started
* Add `--tag` CLI option when building images
* No more copying Dockerfiles around when building images
* Fix bad image builds silently exiting leaving 'ghost' containers
* Add `context` image parameter to allow arbitrary build context directories
* Add `--context` CLI option to allow arbitrary runtime build context directories
* `decking create` no longer starts then stops containers (much faster)
* Add support for cpu shares container option
* Add support for memory limit container option
* Much better output for non TTY environments (e.g. CI)
* Much better error handling
* Fix crashing when containers go away while running `decking attach`
* Add `decking destroy` to remove clusters
* Fix container aliases sometimes not being set

## License

(The MIT License)

Copyright (C) 2013-2015 by Nick Payne / Full Fat Finch Ltd <nick@fullfatfinch.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE
