# dTrinity Protocol's Solidity Smart Contracts

Forked from AAVE v3 for lending and Uniswap v3 for DEX

- [DEX README](./contracts/dex/README.md) for DEX development and deployment tutorial
- [Lending README](./contracts/lending/README.md) for Lending development and deployment tutorial

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
make deploy-contract.local

# Deploy contract to fraxtal_testnet
make deploy-contract.fraxtal_testnet
```

If you want to re-deploy the same contract with the same parameters, you need to deploy with reset flag

```bash
# Deploy contract to local node
make deploy-contract.local.reset

# Deploy contract to fraxtal_testnet
make deploy-contract.fraxtal_testnet.reset
```

If you want to deploy only DEX or Lending, change the corresponding `DEPLOY_ONLY_DEX` or `DEPLOY_ONLY_LENDING` flag in the `.env` file:

- `DEPLOY_ONLY_DEX=true` to deploy only DEX
- `DEPLOY_ONLY_LENDING=true` to deploy only Lending

When deploying on `testnet` and `mainnet`, remember to update the corresponding config file in the `config` folder.

## Lending Rewards

Follow these steps to deploy a new token incentive for an asset:

1. Set emission admin role:
   ```bash
   make lending.set-emission-admin.fraxtal_testnet reward="<reward_token_address>"
   ```
   This sets the emission admin role for the new incentive to our `lendingIncentivesEmissionManager`.

2. Configure incentives:
   ```bash
   make lending.configure-incentives.fraxtal_testnet dataFile="<path_to_config_file>"
   ```
   This configures the incentives for the asset. The config file should be a JSON file with the required structure.

3. Deposit reward:
   ```bash
   make lending.deposit-reward.fraxtal_testnet reward="<reward_token_address>" amount="<amount>"
   ```
   This deposits the reward tokens to the incentives vault.

For more details on parameters, see the following commands:

```bash
# Get emission admin for a reward token
# Params:
# reward: reward address
make lending.get-emission-admin.fraxtal_testnet reward=""
```

```bash
# Set emission admin for a reward token to lendingIncentivesEmissionManager
# Params:
# reward: reward address
make lending.set-emission-admin.fraxtal_testnet reward=""
```

```bash
# Get rewards data for a given asset and reward token
# Params:
# queryFile: path to the JSON file containing the JSON structrure: { "assets": [], "rewards": [] } with array items as asset and reward addresses
make lending.get-rewards-data.fraxtal_testnet queryFile=""
```

```bash
# Configure incentives
# Params:
# dataFile: path to the JSON file containing the JSON array structrure: 
# [{ "asset": "0x1fA02b2d6A771842690194Cf62D91bdd92BfE28d",  // AToken/Stable(Variable)DebtToken address
#    "reward": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",  // Reward token address
#    "distributionEnd": 1720538093,  // Distribution end timestamp
#    "emissionPerSecond": 0 // The emission per second without rewards unit decimals
# }]
make lending.configure-incentives.fraxtal_testnet dataFile=""
```

```bash
# Deposit reward to incentives vault
# Params: 
# reward: reward address
# amount: amount to deposit (the actual amount without unit decimals)

make lending.deposit-reward.fraxtal_testnet reward="" amount=""
```