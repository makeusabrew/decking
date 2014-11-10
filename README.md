# decking—simplified management for clusters of Docker containers

Decking aims to simplify the creation, organsation and running of clusters
of Docker containers in a way which is familiar to developers; by reading
information from a `decking.yaml` package file on a project by
project basis.

## Installation

```[sudo] npm install -g decking```

While the project is under heavy development, the best place to find
the most up-to-date documentation is [decking.io](http://decking.io).

## Walkthrough

The following uses the [example decking project](https://github.com/makeusabrew/decking-example) at https://github.com/makeusabrew/decking-example

It is a simple app with five pieces:

* a simple "web" process; it responds to requests on port 8888 for '/' with the number of visitors seen, and records your visit with the ~~NSA~~ simple "api" process
* a simple "api" process: a GET request to its port 7777 returns the current visitors count; a PUT request to /visitors increments and returns the new count
* a simple "admin" process: a GET request to its port 8887 for '/visits' returns a beautiful json-formatted dashboard showing, you guessed it, the number of visitors.
* a redis, for tracking the visitor counts
* a mongodb, for amusement purposes only

Decking will handle building the images; defining the containers; and running them, with appropriate linking of container ports and volumes, in the correct order.

### Build images

First, build the images:

```
$ decking build all
Looking up build data for decking/example-api
Building image decking/example-api from ./docker/api/Dockerfile
Uploading compressed context...
Step 0 : FROM dockerfile/nodejs
 ---> 9a76e1635147
... (snip) ...
Removing intermediate container 3bcf36cada57
Successfully built b8a5c36592d5
```

#### Build a specific image

You can also single out an image from the `images` section of the decking.yaml: eg. `decking build decking/example-api`. Decking is performing the equivalent of running `docker build -t decking/example-api ./docker/api`


#### A psychological speedup

Docker can take a long time to pull in base images -- 5-10 minutes -- and since decking talks directly to the docker API it is mute during the execution. You may wish to instead seed the remote images we'll use pre-emptively, which means you see all the happy little progress reassurances and know not to blame decking if anything funny happens. To do so, run these commands and then run `decking build all`:

    docker pull makeusabrew/mongodb:latest
    docker pull makeusabrew/redis:latest
    docker pull dockerfile/nodejs:latest

#### Admire the results

You will now see the images listed in docker:

```
$ docker images
decking/example-api   latest              905eb7838ff1        17 seconds ago      520.3 MB
decking/example-web   latest              274dc828a2aa        10 seconds ago      520.3 MB
decking/example-admin latest              7a621fc52605        7 seconds ago       520.3 MB
dockerfile/nodejs     latest              9a76e1635147        2 weeks ago         495.4 MB
makeusabrew/mongodb   latest              a3f56340a94a        12 months ago       479.4 MB
makeusabrew/redis     latest              05cab2b008fb        11 months ago       335.6 MB
```

### Create containers

Now create the containers. Decking gives you the concept of "groups": set of containers that associate among themselves and not, generally, with those in other groups.

```
$ decking create dev
Using overrides from group 'dev'
redis.dev    creating... ✔
mongodb.dev  creating... ✔
api.dev      creating... ✔
web.dev      creating... ✔
admin.dev    creating... ✔
```

The containers have now been created, but aren't running:

```
$docker ps -a
CONTAINER ID        IMAGE                          COMMAND                CREATED             STATUS                       PORTS               NAMES
72e57ceb783d        decking/example-admin:latest   "node /app/src/admin   5 seconds ago       Exited (143) 3 seconds ago                       admin.dev
b791f1460cc7        decking/example-web:latest     "node /app/src/web"    5 seconds ago       Exited (143) 3 seconds ago                       web.dev
a75b1555ed95        decking/example-api:latest     "node /app/src/api"    5 seconds ago       Exited (143) 3 seconds ago                       admin.dev/api,api.dev,web.dev/api
e166f025ce43        makeusabrew/mongodb:latest     "usr/bin/mongod --no   5 seconds ago       Exited (0) 3 seconds ago                         admin.dev/api/db,api.dev/db,mongodb.dev,web.dev/api/db
88f4f3665e14        makeusabrew/redis:latest       "/redis-2.8.0/src/re   6 seconds ago       Exited (0) 3 seconds ago                         admin.dev/api/redis,api.dev/redis,redis.dev,web.dev/api/redis
```

### Start the containers

Start the containers:

```
$ decking start dev
Using overrides from group 'dev'
redis.dev    starting... ✔
mongodb.dev  starting... ✔
api.dev      starting... ✔
web.dev      starting... ✔
admin.dev    starting... ✔
```

A `docker ps -a` should show they are running: 

```
$ docker ps -a
CONTAINER ID        IMAGE                          COMMAND                CREATED             STATUS              PORTS                    NAMES
72e57ceb783d        decking/example-admin:latest   "node /app/src/admin   11 seconds ago      Up 1 seconds        0.0.0.0:8887->8887/tcp   admin.dev
b791f1460cc7        decking/example-web:latest     "node /app/src/web"    11 seconds ago      Up 1 seconds        0.0.0.0:8888->8888/tcp   web.dev
a75b1555ed95        decking/example-api:latest     "node /app/src/api"    11 seconds ago      Up 1 seconds        0.0.0.0:7777->7777/tcp   admin.dev/api,api.dev,web.dev/api
e166f025ce43        makeusabrew/mongodb:latest     "usr/bin/mongod --no   11 seconds ago      Up 2 seconds        27017/tcp                admin.dev/api/db,api.dev/db,mongodb.dev,web.dev/api/db
88f4f3665e14        makeusabrew/redis:latest       "/redis-2.8.0/src/re   12 seconds ago      Up 2 seconds        6379/tcp                 admin.dev/api/redis,api.dev/redis,redis.dev,web.dev/api/redis
```

Check the port mappings look like those here: the ports are both open and published to the docker container. If you are running Docker in a VM (eg. OSX users with boot2docker), you will want to set up port forwarding for those ports now. (Or, if you're too excited, ssh onto the docker host and ruun the curl commands from there).


### Enjoy the running multi-container app

Curl the "API" to get the visitors count (none, yet):

```
curl http://localhost:7777/visitors
{"count":"0"}
```

Visiting the "website" increments the visitors count by making a backend call to the API, which in turn increments a counter in redis:

```
$ curl http://localhost:8888/
You are visitor number 1 since the server started!
$ curl http://localhost:8888/
You are visitor number 2 since the server started!
  # Hit the API to see the visitors count
$ curl http://localhost:7777/visitors
{"count":"2"}
  # Faking a web hit of our own
$ curl -X PUT http://localhost:7777/visitors
{"count":"3"}
  # "Visiting" the admin dashboard:
  curl http://localhost:8887/visits
```

## Decking files: images, containers, groups and clusters

### `images`:

Specifies the name and path of local images to build.

```yaml
images:
  "decking/example-api":   "./docker/api"
  "decking/example-admin": "./docker/admin"
  "decking/example-web":   "./docker/web"
```

In this example, the image named `decking/example-api` will be built using the Dockerfile within `./docker/api`.

### `containers`:

Configures the containers. See the detailed description of the container directives below.

### `clusters`: map containers to groups

The clusters section defines what containers should be instantiated for each group. For instance, in the example decking file the production group only has `api` and `web`, whereas development runs `api`, `web` and `admin` containers.

### `groups`: define environment-specific settings

Override settings for containers within the particular group. For instance, in the example decking.yaml, each of the environments defines their own port mapping, to avoid collisions.

## Decking container directives

* ` env`	  -- Environment variables
* ` dependencies` -- Containers to link; these will be created first.
* ` port`	  -- Ports to publish to the docker machine
* ` privileged`	  -- Run in privileged mode
* ` mount`	  -- Volumes to share among other containers or the docker machine
* ` mount-from`	  -- Mounts all volumes defined on the given container
* ` image`	  -- The docker image to use
* ` extra`	  -- Other arguments to supply the entrypoint script

The only required directive for a container is `image`

### ` image`: The docker image to use

If the label is one of those in the `images` section, the container will use the locally-built image.  Otherwise, it will be fetched from a docker repo.

Pulling in a remote image can take a _long_ time. Since decking is driving docker's API directly, it can be hard to tell if decking is hung or just waiting. To avoid this tsoris, run `docker pull [image/name]` beforehand for any foreign images.

### `dependencies`: Containers to link

Listing another container as a dependencies will (a) ensure it is constructed first, and (b)
[make it a linked container](https://docs.docker.com/userguide/dockerlinks/). This lets the api
machine talk to redis and mongodb without knowing where or why or how they were created. The
container name will be scoped by the cluster. In the `dev` cluster, these lines will link to the
`redis.dev` and `mongodb.dev` containers.

```yaml
containers:
  api:
    dependencies:
      - redis
      - mongodb:db
```

### `port`: Publish ports to the docker machine

Pairs a port on the docker host machine with a port exposed in the container (using `EXPOSE [portnum]` in the Dockerfile).

```yaml
containers:
  api:
    port:       ["8100:7777"]
```

The docker host machine's port is listed first -- the above pairs port 7777 on the api container with port 8100 on the docker machine. If you are running in a VM, 8100 is the one you'll forward.

### `env`: Environment variables

Specify environment variables with a "VARNAME=value" string. Decking will prompt you for env vars with a value of '-' (a single unquoted dash)

```yaml
groups:
  dev:
    options:
      env:  ["NODE_ENV=build"]
    containers:
      api:
        env: ["FAVORITE_COLOR=-"]
```

In this example, all machines in the dev group will have `$NODE_ENV` set to `build`. Additionally, when the `api` container is launched, decking will prompt for the value of the `FAVORITE_COLOR` variable.

### ` mount`: Share volumes among other containers or the docker machine

With just a path, this defines a volume for other containers to mount using he `mount-from`
directive.

With a colon ("localname:remotename"), docker will mount given directory path on the docker machine at the second-given path on the container. Append :rw or :ro for read-write or read-only access. Boot2Docker users should make sure the VM host filesystem appears on the guest machine.

Example:

```yaml
containers:
  api:
    mount:
      - "/api_exported"
      - ".:/data/this_repo:rw"
```

The contents of /api_exported from this container will appear on any container that lists this one as a `mount-from`.

The contents of the current directory will appear on the container at `/data/this_repo`, and will furthermore appear on any container that lists this container as a `mount-from`.

### `mount-from`: Mount all volumes defined on the given container

Mounts all volumes that the given container defined. This container now has `/api_exported` (with
data from the api container) and `/data/this_repo` (with data from the docker machine):

```yaml
containers:
  web:
    mount-from:
      - "api"
```

Names will be suitably scoped to the cluster: the web.dev machine mounts volumes from the api.dev container.

### ` extra`: Other arguments to supply the entrypoint script

The decking.yaml file shows an  example, passing two configuration args to the mongodb runner.

### ` privileged`:  Run in privileged mode

What it says.

### Forwarding ports for VM-hosted docker machines

The decking files here use the `port` directive to associate various container ports with ports on the docker UI container.  However, if your docker machine is running as a VM (as any Mac OSX or windows installation will be), there is an additional step required to make it appear on the host OS.

An ad-hoc solution is to use an ssh tunnel: `ssh [YOUR_USER@YOUR_DOCKER_MACHINE_IP] -L 8200:localhost:8200` -- the first number is the port on your host machine, the second is the target port on the docker machine. (Note that the port number on the docker container is irrelevant.)  [Boot2docker](http://boot2docker.io/) can do this easily by running eg. `boot2docker ssh -L 8200:localhost:8200`. Permanent setup of port forwarding is handled by the virtualization layer -- not shipyard or docker -- so you'll have to consult the VM provider documentation. Boot2Docker users can find several ways to accomplish [port forwarding described in the Boot2Docker docs](https://github.com/boot2docker/boot2docker/blob/master/doc/WORKAROUNDS.md)

## Other topics

### Cleanup

```
      # stop the containers
    $ decking stop dev
    redis.dev    stopping... ✔
    mongodb.dev  stopping... ✔
    api.dev      stopping... ✔
    web.dev      stopping... ✔
    admin.dev    stopping... ✔
      # remove them:
    $ docker rm app.dev web.dev admin.dev
      # Check that nothing relevant is there:
    $ docker ps -a
    CONTAINER ID        IMAGE               COMMAND             CREATED             STATUS              PORTS               NAMES
      # remove the project images
    # docker rmi decking/example-api decking/example-web decking/example-admin
    Deleted: 56d1fe739e646a58e77bb1e1c602ac0346f6fea631c495c4841cc4c2a21756b5
    Deleted: 3ba829b6b709a909507fac7995818171a7125cac6ae10646ecbd2786ec2d1655
    Deleted: e053fa2d4391ba343d415f91842b57693a5ed11edd0befde46be820560b2c804
    Untagged: decking/example-web:latest
    Deleted: 574640c9b988cda2c1125d598c49509d519ec8be555cee8ba69d96eb810daefe
    Deleted: 1e599bc9ece3534f463c6984bbfaf16ab7f6568886ed17bee84315affb9f074e
    ...
```


### Fake what decking is doing

Here is the equivalent of `decking create` for the api and web commands in the  dev cluster:

```
docker run --name api.dupe --env 'NODE_ENV=build' --publish "8100:7777" \
       --link mongodb.dev:db --link redis.dev:redis -v /api_exported -v $PWD:/data/this_repo \
      -d decking/example-api
docker run --name web.dupe --env 'NODE_ENV=build' --publish "8101:8888" \
      --link api.dupe:api --volumes-from=api.dupe \
      -d decking/example-web
```

Verify that the differences between our handcrafted command and decking's commands are inessential:

```
docker inspect api.dupe > /tmp/api-dupe.txt
docker inspect api.dev  > /tmp/api-dev.txt
diff -uw /tmp/api-{dev,dupe}.txt
```

The build command is basically doing

    ln -s ./docker/api/Dockerfile ./Dockerfile
    docker build -t decking/example-api .
    rm ./Dockerfile

### .dockerignore file

The .dockerignore file in the base of this repo blacklists paths that are unimportant to docker. Everything else is packaged and sent to docker whenever you build an image.


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
