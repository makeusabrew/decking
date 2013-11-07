# decking

## Project goals

To abstract some of the slightly more inconvenient docker mechanisms
into quick, clear and repeatable commands.

Different environments should be supported to allow variations of
commands in development, test, ci and production.

### build

Alleviate the inconvenience of ADD requiring a local (./ downwards)
context.

Take the image name from the Dockerfile, if supplied in expected format

Use standard directory layouts to be able to find Dockerfiles with
single word string arguments.

Rebuild all parent images, or up to a level specified (e.g. --parents=1)

### run

Take run args from Dockerfile meta if supplied in expected format.

Allow dependencies to be specified, e.g. containers used as links
can be started in advance.

### status

Simple shortcut for `docker ps`
