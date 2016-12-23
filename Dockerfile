FROM node:6

RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb http://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list

RUN apt-get update && apt-get install yarn

ADD ./package.json /package.json
RUN cd / && yarn install

ADD . /docker-development-node-runner
RUN mv /node_modules /docker-development-node-runner/

WORKDIR /docker-development-node-runner
CMD ["/docker-development-node-runner/bin/node-runner","/app","/work"]
