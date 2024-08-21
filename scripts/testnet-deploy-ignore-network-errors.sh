#!/bin/bash

while true; do
    output=$(make deploy-contract.fraxtal_testnet)
    echo "$output"
    if echo "$output" | grep -q "ProviderError: Post \"http://tx-forwarder:8080\": EOF"; then
        echo "Error encountered, retrying..."
    else
        break
    fi
    sleep 1
done