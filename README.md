# Nosana CLI

The Nosana CLI is a command-line tool for interacting with the [Nosana Network](https://nosana.com), enabling users to post jobs to the network or run a Nosana Node seamlessly.

---
## Features

- **Post Jobs**: Easily post jobs to the Nosana Network.
- **Run a Node**: Set up and manage a Nosana Node.

## Install

```shell
$ npm install -g @nosana/cli

# or install with yarn
$ yarn global add @nosana/cli
```

**HINT**\
Alternatively, you can use `npx` to use the cli directly without installing it globally:

```shell
$ npx @nosana/cli help
```

## Basic Usage

Once installed, you can invoke CLI commands directly from your OS command line through the `nosana` executable. See the available commands by entering the following:

```shell
$ nosana help
```

All interactions with Nosana CLI are of the form

```shell
$ nosana [command] [options] [argument]
```

Available `node` commands:

```
node view [options] <node>                Watch public node job/queue status
node join [command]                       Register for Nosana Grid
node start [options] <market>             Start Nosana Node
node run [options] <job-definition-file>  Run Job Definition File
node help [command]                       display help for command
```

Available `job` commands:

```
job post [options] [command...] Create a job to run by Nosana Runners
job get [options] <job>         Get a job and display result
job download <ipfs> [path]      Download an external artifact from IPFS to specified path
job help [command]              display help for command
```

Global options:

```
-V, --version                        output the version number
-n, --network <network>              network to run on (choices: "devnet", "mainnet", default: "mainnet")
--rpc <url>                          RPC node to use
--log <logLevel>                     Log level (choices: "info", "none", "debug", "trace", default: "debug")
```

## View a node without SSH

Use the full node wallet address (the address after `/hosts/` in Nosana Explorer),
not its IP address. Replace `NODE_WALLET_ADDRESS` below with that address.
Brackets in help indicate optional flags; do not type them.

```shell
nosana node view --help
nosana node view NODE_WALLET_ADDRESS
```

The viewer polls public chain state every ten seconds and prints changes in job
assignment, job state and queue position. Ctrl-C stops it. It needs no SSH login
or wallet key and does not join/leave queues, start/stop jobs, sign transactions,
or subscribe to private job logs. An assignment does not prove that the GPU is
executing work, and an empty queue/run result does not establish that a host is
offline. RPC errors appear as unavailable status and are retried on the next poll.

Use `--once` for one observation (exit status 1 if the read fails). The existing
`--network mainnet|devnet` and `--rpc <url>` options select the chain/RPC. The RPC
must support filtered `getProgramAccounts` reads. A host address alone does not
grant access to the host's full live console or authorized job-log streams.

To try the compiled fork without Git or a global installation, replace
`NODE_WALLET_ADDRESS` and run:

```shell
npx --yes --ignore-scripts=false --package=node@24.22.2 -- npm exec --yes --ignore-scripts --package="https://github.com/MachoDrone/nosana-cli/releases/download/node-view-fix-1/nosana-cli-0.0.0.tgz" -- nosana node view NODE_WALLET_ADDRESS
```

The first run downloads Node.js 24, the build and its runtime dependencies into
npm's cache. The temporary runtime leaves your system Node.js and installed CLI
unchanged. The explicit package URL selects this fork even when an older CLI is
installed locally. Ctrl-C stops the viewer.

This command was verified starting from Node.js 18.20.8/npm 10.8.2. Running the
package directly under Node.js 18 fails with `ERR_REQUIRE_ESM` in a dependency.
The outer command allows the Node.js package's installation script; the inner
command disables installation scripts for the CLI and its dependencies.

This fork repairs the recursive `node view` implementation. Installing the
upstream `@nosana/cli` package from npm still uses the upstream version. To run
this checkout, use Node.js 24, `npm ci`, `npm run build`, then
`node dist/src/index.js node view <node-address>`.

## Start a Nosana Node

To get started with your Nosana Node on the Nosana Grid, you can run a node after you've installed the prerequisites with the following command:

`nosana node start [options]`

Options:

```
  --provider <provider>     provider used to run the job (choices: "docker", "podman", default: "podman")
  -w, --wallet <wallet>     path to wallet private key (default: "~/.nosana/nosana_key.json")
  --docker, --podman <URI>  Podman/Docker connection URI (default: "~/.nosana/podman/podman.sock")
  -h, --help                display help for command
```

## Starting node

With the `nosana node start [options]` command you can start a Nosana Node and join the Nosana Network.

Options:

```
  --provider <provider>     provider used to run the job (choices: "docker", "podman", default: "podman")
  -w, --wallet <wallet>     path to wallet private key (default: "~/.nosana/nosana_key.json")
  --docker, --podman <URI>  Podman/Docker connection URI (default: "~/.nosana/podman/podman.sock")
  -h, --help                display help for command
```

## Posting jobs

With the `nosana job post [options] [command...]` command you can post nosana jobs to the Nosana Network. The default job type is `container`, meaning nodes will run your job in docker containers.

### Example

The following command will run `echo hello world` with the default `ubuntu` docker image (can be changed with the `--image` flag), while we specify the `--wait` flag to wait for the results:

```shell
$ nosana job post echo hello world --wait
```

All available options for `post`:

```
--airdrop                request an airdrop when low on SOL on devnet (default: true)
--gpu                    enable GPU on node
-o, --output <path>      specify which folder inside the container you want to upload
--type <type>            type to run (default: "container")
-i, --image <image>      docker image to use (default: "ubuntu")
--f, --file <path>       file with the JSON flow
--wait                   wait for job to be completed and show result
--download               download external artifacts (implies --wait)
```

## Documentation

Please [visit our documentation](https://docs.nosana.com/) for a full list of commands and examples.

For technical details on how the Nosana CLI works, refer to the technical documentation:

[Technical Documentation](https://github.com/nosana-ci/nosana-cli/tree/main/docs)
