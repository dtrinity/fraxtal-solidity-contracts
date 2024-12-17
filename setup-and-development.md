# Development, deployment, and testing

## Setup

```bash
make install
```

## Linting

```bash
make lint
```

## Compile contracts

```bash
make compile
```

## Run tests

```bash
# Run contract tests
make test.contract

# Run TypeScript script tests
make test.typescript

# Run a specific test file
yarn hardhat test test/dusd/AmoManager.ts

# Run all tests in a directory
yarn hardhat test test/dusd/*.ts
```

## Run a local node

Run a local node

```bash
make run.local-node
```

## Deployment configuration

- You can configure the deployment network in the `.env` file and in `config/networks`
- Whenever adding a new network, you remember to add the corresponding configuration in `config/networks` and update the `config/config.ts`

## Deploy test tokens

In development, you can deploy test tokens to the testnet node

```bash
# Deploy test tokens to fraxtal_testnet
make deploy-mint.tokens network=fraxtal_testnet
```

You only need to run this command once. The test tokens will be deployed to the network and you can use them for testing.

When adding a new network support, you also need to update the `hardhat.config.token.ts` for the corresponding network.

- This configuration file is used to deploy test tokens to the network.

## Deploy test price aggregators (oracles)

In development, you can deploy test price aggregators to the testnet node

```bash
# Deploy test price aggregators to fraxtal_testnet
make deploy-price-aggregators network=fraxtal_testnet
```

You only need to run this command once. The test price aggregators will be deployed to the network and you can use them for testing.

When adding a new network support, you also need to update the `hardhat.config.price-aggregator.ts` for the corresponding network.

## Deploy contracts

```bash
# Deploy contract to local node
make deploy-contract.localhost

# Deploy contract to fraxtal_testnet
make deploy-contract.fraxtal_testnet
```

If you want to re-deploy the same contract with the same parameters, you need to deploy with reset flag

```bash
# Deploy contract to local node
make deploy-contract.localhost.reset

# Deploy contract to fraxtal_testnet
make deploy-contract.fraxtal_testnet.reset
```

If you want to deploy only DEX or Lending, change the corresponding `DEPLOY_ONLY_DEX` or `DEPLOY_ONLY_LENDING` flag in the `.env` file:

- `DEPLOY_ONLY_DEX=true` to deploy only DEX
- `DEPLOY_ONLY_LENDING=true` to deploy only Lending

When deploying on `testnet` and `mainnet`, remember to update the corresponding config file in the `config` folder.

## Lending Rewards

Learn more about configuring and adjusting rewards for dLEND by reading [this document](./scripts/lending/rewards/README.md).

## Liquidator Bot

To build and run the bot locally, run the following command:

```shell
make docker.buildandrun.liquidator-bot.arm64
```

To build and deploy the bot image to the remote host, run the following command:

```shell
make docker.buildanddeploy.liquidator-bot.fraxtal_testnet
```

To re-deploy the bot (not need to re-build and push the image), run the following command:

```shell
make docker.deploy.liquidator-bot.fraxtal_testnet
```

To ssh into the remote host and run the bot, run the following command:

```shell
make remote.ssh.liquidator-bot
```

## Curve tests

Make sure to run local ethereum node first

```bash
make run.local-ethereum
```

Then run the tests

```bash
make test.curve
```

## Generate Curve swap params

Check [scripts/curve-tools/README.md](scripts/curve-tools/README.md) for more information
