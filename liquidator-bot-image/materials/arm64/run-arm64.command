#!/bin/bash

# Get command line arguments
network=fraxtal_mainnet
dex=combo

if [ -z "$network" ] || [ -z "$dex" ]; then
  echo "Usage: $0 <network> <dex>"
  exit 1
fi

# Get the current directory of the script
SCRIPT_DIR=$(dirname "$0")

# Load the docker image
echo "Loading docker image..."
docker load -i ${SCRIPT_DIR}/liquidator-bot-arm64.tar

# If there is a running container, remove it
if docker ps | grep -q liquidator-bot-${network}; then
  echo "Removing running container..."
  docker rm -f liquidator-bot-${network}
fi

# Run the container with the specified configuration
echo "Running container..."
docker run \
  -d \
  -v ${SCRIPT_DIR}/.env:/usr/src/.env:ro \
  -v ${SCRIPT_DIR}/state:/usr/src/state \
  --memory 768m \
  --restart unless-stopped \
  --name liquidator-bot-${network} \
  liquidator-bot:latest ${network} ${dex}
