FROM node:18.12.0-alpine3.16

# As it is hard to compile the TypeScript code when using typechain, thus we decided
# to run the bot with TypeScript instead of JavaScript.

WORKDIR /usr/src

# Install the necessary packages
COPY package.json /usr/src/
COPY yarn.lock /usr/src/
COPY ./.yarn /usr/src/.yarn
RUN yarn install

# Prepare the TypeScript environment
COPY tsconfig.json /usr/src/tsconfig.json

# Copy src files
COPY src/ /usr/src/src/

ENTRYPOINT [ "yarn", "ts-node src/main.ts" ]
