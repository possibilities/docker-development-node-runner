# Docker development node runner

An opinionated helper script for running a node app in a container during development.

[![CircleCI](https://circleci.com/gh/possibilities/docker-development-node-runner.svg?style=svg)](https://circleci.com/gh/possibilities/docker-development-node-runner)

## Features

* Builds app and runs it
* When files change the app is killed, rebuilt and restarted
* If the app crashes the error is displayed and restarted when files change again
* To speed up expensive processes (e.g. preprocessing) app source code is copied from docker volume to local docker fs when files change

## Requirements

NodeJS 6+

### Usage

Apps expose functionality via `package.json`'s `scripts` key:

* `build`: runs before the app is started and restarted
* `start`: starts the app
