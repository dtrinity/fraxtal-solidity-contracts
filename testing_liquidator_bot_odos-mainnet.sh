#!/bin/bash

# Read whether to re-deploy (true/false) from 1st argument and which contract to redeploy from 2nd argument
REDEPLOY=$1
CONTRACT_TYPE=$2

if [ -z "$REDEPLOY" ] || [ -z "$CONTRACT_TYPE" ]; then
    echo "Usage: $0 <true/false> <flashmint/flashloan/both>"
    exit 1
fi

if [ "$CONTRACT_TYPE" != "flashmint" ] && [ "$CONTRACT_TYPE" != "flashloan" ] && [ "$CONTRACT_TYPE" != "both" ]; then
    echo "Second argument must be either 'flashmint', 'flashloan' or 'both'"
    exit 1
fi

# Migration file path
MIGRATION_FILE="deployments/fraxtal_mainnet/.migrations.json"

if [ "$REDEPLOY" = "true" ]; then
    if [ "$CONTRACT_TYPE" = "flashmint" ] || [ "$CONTRACT_TYPE" = "both" ]; then
        # Remove FlashMintLiquidatorAaveBorrowRepayOdos deployment to trigger re-deployment
        echo "Removing FlashMintLiquidatorAaveBorrowRepayOdos deployment from .migrations.json..."
        jq 'del(.["FlashMintLiquidatorAaveBorrowRepayOdos"])' $MIGRATION_FILE > temp.json && mv temp.json $MIGRATION_FILE
    fi
    
    if [ "$CONTRACT_TYPE" = "flashloan" ] || [ "$CONTRACT_TYPE" = "both" ]; then
        # Remove FlashLoanLiquidatorAaveBorrowRepayOdos deployment to trigger re-deployment
        echo "Removing FlashLoanLiquidatorAaveBorrowRepayOdos deployment from .migrations.json..."
        jq 'del(.["FlashLoanLiquidatorAaveBorrowRepayOdos"])' $MIGRATION_FILE > temp.json && mv temp.json $MIGRATION_FILE
    fi

    # Redeploy contracts
    make deploy-contract.liquidator-bot.fraxtal_mainnet
fi

# Run liquidation script
echo "Running liquidation script..."
yarn hardhat run --network fraxtal_mainnet scripts/liquidator-bot/odos/liquidate_specific_users.ts
