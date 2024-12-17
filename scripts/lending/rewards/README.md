# Lending Rewards

Follow these steps to deploy a new token incentive for an asset:

1. Set emission admin role:
   ```bash
   make lending.set-emission-admin reward="<reward_token_address>"
   ```
   This sets the emission admin role for the new incentive to our `lendingIncentivesEmissionManager`.

2. Configure incentives:
   ```bash
   make lending.configure-incentives dataFile="<path_to_config_file>"
   ```
   This configures the incentives for the asset. The config file should be a JSON file with the required structure.

3. Deposit reward:
   ```bash
   make lending.deposit-reward reward="<reward_token_address>" amount="<amount>"
   ```
   This deposits the reward tokens to the incentives vault.

For more details on parameters, see the following commands:

```bash
# Get emission admin for a reward token
# Params:
# reward: reward address
make lending.get-emission-admin reward=""
```

```bash
# Set emission admin for a reward token to lendingIncentivesEmissionManager
# Params:
# reward: reward address
make lending.set-emission-admin reward=""
```

```bash
# Get rewards data for a given asset and reward token
# Params:
# queryFile: See below for example queryFile
make lending.get-rewards-data queryFile=""
```

```json
[
  {
    "assets": [
      "list of asset token addresses...",
    ],
    "rewards": [
      "list of reward token addresses..."
    ]
  }
]
```

```bash
# Configure incentives
# Params:
# dataFile: See below for example dataFile

make lending.configure-incentives dataFile=""
```

Example dataFile:
```json
[
  {
    "asset": "The address of the dToken/debtToken",
    "reward": "The address of the reward token",
    "distributionEnd": 1725962776,  // Distribution end timestamp
    "emissionPerSecond": 0.00624 // The tokens per second without unit decimals
    // For example, 0.5 token per second = 0.5, can be float
  }
]
```

```bash
# Deposit reward to incentives vault
# Params: 
# reward: reward address
# amount: amount to deposit (the actual amount without unit decimals)

make lending.deposit-reward reward="" amount=""
```

## Example math

Let's say we want to deploy new incentives for `dUSD` by rewarding `dUSD`

Let's say there is currently 4M dUSD being borrowed and we want to target a 5% reward APR over a period of 3 months.

First we need to calculate the distributionEnd, for that you can use a tool like https://www.epochconverter.com/. Note that this just stipulates the end of the emission, it doesn't affect the emission rate.

Next we will need to calculate the emissionPerSecond. With 4M dUSD, 5% APR would be 4000000 * 1.05^(3/12) - 4000000 ~= 49,088.93 dUSD over 3 months.

There are about 91 days in 3 months, which is 2,184 hours, or 131,040 minutes, which is 7,862,400 seconds. Therefore the emissionPerSecond would be 49,088.93 / 7,862,400 ~= 0.00624.

