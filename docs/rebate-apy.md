# dLEND Rebate APY (variable debt) – quick guide

This is how we pay the “rebate APY” on variable‐rate debt (e.g., dUSD and other dSTABLEs in the future) through the rewards system so an integrator can compute it off‑chain.

## Core contracts on Fraxtal mainnet
- Rewards controller (proxy, `IRewardsController` ABI): `0x0E20D018A1309fED73AbdF2187FC452D1DB77915` (`deployments/fraxtal_mainnet/IncentivesProxy.json`)
- Emission manager: `0xda1a5239996624eA71b4E77cf21c837E4194c278` (`deployments/fraxtal_mainnet/EmissionManager.json`)
- Rewards transfer strategy (pull): `0xAAEe148793253a64402566Bd1c02e7f5d3ed35a5` (`deployments/fraxtal_mainnet/PullRewardsTransferStrategy.json`)
- Price oracle (same feed used on-chain for rewards): `0x29AdCbA0244bE0dd9220AE114F8EdAE5Ccda87Ab` (`deployments/fraxtal_mainnet/AaveOracle-dTrinity-Lend.json`)
- Variable debt tokens (rewarded assets):
  - dUSD variable debt: `0x6B937da34fb213763458a3b7672B950df1F560dE`
  - ETH market variable debt (current ETH borrowable asset, i.e. “dETH” market): `0x0066AEAA1D151445BC602517296F50c50c6393a0` (wfrxETH variable debt)
- Reward token you’ll likely see:
  - dUSD: `0x788D96f655735f52c676A133f4dFC53cEC614d4A`
  - For ETH incentives, query the controller’s reward list (see below) to confirm which token is active.
- Optional helper: `UiIncentiveDataProviderV3` at `0x21bD81b33D4B04B94bd30C6f015484E830b68830` returns the same reward data already aggregated for UIs.

## What to read on-chain
1. Rewards list (to know which reward tokens are active): `IRewardsController.getRewardsList()`.
2. Per‑asset/per‑reward config: `IRewardsController.getRewardsData(asset, reward)` → `(index, emissionPerSecond, lastUpdateTimestamp, distributionEnd)`.
3. Asset supply for the distribution:
   - For variable debt tokens, use `VariableDebtToken.totalSupply()` (actual debt) or `scaledTotalSupply()` with the same index factor; the ratio vs. user balance is what matters and matches the controller’s math.
4. Prices (USD terms) from `IAaveOracle.getAssetPrice(token)`.

## APY formula (per asset/reward)
Let:
- `e` = `emissionPerSecond` (raw, reward token decimals)
- `Pd` = price of the debt asset in base currency (USD)
- `Pr` = price of the reward token in base currency (USD)
- `D` = total variable debt (debt token `totalSupply()`, token decimals)
- `S` = seconds in a year = 31_536_000

Steps:
1. `emissionRate = e / 10^rewardDecimals` (reward tokens per second)
2. `rewardUsdPerSec = emissionRate * Pr`
3. `debtUsd = (D / 10^debtDecimals) * Pd`
4. `rewardAPR = rewardUsdPerSec * S / debtUsd`
5. `rewardAPY ≈ rewardAPR` (or `pow(1 + rewardAPR / S, S) - 1` if you want continuous compounding)

Do this separately for each reward token; sum APRs if multiple rewards are live on the same debt token.

## Minimal call sketch
```js
// asset = variable debt token (e.g., dUSD or wfrxETH var debt token)
// reward = reward token (e.g., dUSD or whatever getRewardsList() returns)
const [_, emissionPerSecond, , distributionEnd] =
  await rewardsController.getRewardsData(asset, reward);

const totalDebt = await variableDebtToken.totalSupply(); // in debt token decimals
const rewardDecimals = await rewardToken.decimals();
const debtDecimals = await variableDebtToken.decimals();
const Pr = await aaveOracle.getAssetPrice(reward);
const Pd = await aaveOracle.getAssetPrice(await variableDebtToken.UNDERLYING_ASSET_ADDRESS());

// plug into formula above; stop emitting after distributionEnd
```

## Notes
- The rewards controller already accounts for scaled balances; using `totalSupply()` keeps your APY denominator aligned with what borrowers see.
- If `block.timestamp > distributionEnd`, treat emission as zero.
- Use the same oracle as on-chain (`AaveOracle`) to stay consistent with what users earn/see.
