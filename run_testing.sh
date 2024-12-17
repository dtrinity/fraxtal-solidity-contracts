# Read first argument
#   If first argument is not empty, set it to a variable
#   If first argument is empty, exit with error message
# Read 2nd argument
#   If 2nd argument is not empty, set it to a variable
#   If 2nd argument is empty, exit with error message

if [ -z "$1" ]
then
    echo "Must provide 'true' or 'false' as first argument, 'true' means redeploying contracts, 'false' means not redeploying contracts"
    exit 1
fi

if [ -z "$2" ]
then
    echo "Must provide 'true' or 'false' as second argument, 'true' means running prepare script, 'false' means not running prepare script"
    exit 1
fi

REDEPLOY=$1

if [ $REDEPLOY == "true" ]
then
    echo "Redeploying contracts"
    yarn hardhat run --network fraxtal_testnet scripts/dloop/DLoopVaultCurve/remove_deployment_migration.ts
    make deploy-contract.fraxtal_testnet
else
    echo "Not redeploying contracts"
fi

if [ $2 == "true" ]
then
    echo "Running prepare script"
    yarn hardhat run --network fraxtal_testnet scripts/dloop/DLoopVaultCurve/debugging_prepare.ts
else
    echo "Not running prepare script"
fi

echo "Running withdrawal test"
yarn hardhat run --network fraxtal_testnet scripts/dloop/DLoopVaultCurve/debugging_withdraw.ts
