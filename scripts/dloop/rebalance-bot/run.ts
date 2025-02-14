import hre from "hardhat";

import { DLoopVaultBase, DLoopVaultCurve } from "../../../typechain-types";
import { printLog } from "./utils";

const ONE_HUNDRED_PERCENT_BPS = 10000;

/**
 * Rebalances a DLoop vault position by either increasing or decreasing leverage
 *
 * @param vault The DLoop vault contract
 * @param index The iteration index for logging
 */
async function rebalance(
  vault: DLoopVaultBase | DLoopVaultCurve,
  index: number,
): Promise<void> {
  const currentLeverageBps = await vault.getCurrentLeverageBps();
  const targetLeverageBps = await vault.TARGET_LEVERAGE_BPS();
  const lowerBoundBps = await vault.LOWER_BOUND_TARGET_LEVERAGE_BPS();
  const upperBoundBps = await vault.UPPER_BOUND_TARGET_LEVERAGE_BPS();

  printLog(index, `Current leverage: ${currentLeverageBps} bps`);
  printLog(index, `Target leverage: ${targetLeverageBps} bps`);
  printLog(index, `Lower bound: ${lowerBoundBps} bps`);
  printLog(index, `Upper bound: ${upperBoundBps} bps`);

  // Get oracle price for slippage protection
  const oracle = await hre.ethers.getContractAt(
    "IPriceOracleGetter",
    await vault.getOracleAddress(),
  );
  const underlyingAsset = await vault.getUnderlyingAssetAddress();
  const assetPriceInBase = await oracle.getAssetPrice(underlyingAsset);

  if (currentLeverageBps < lowerBoundBps) {
    // Need to increase leverage
    printLog(index, "Position is underleveraged, increasing leverage...");

    // Calculate amount to increase leverage back to target
    const totalAssets = await vault.totalAssets();
    const leverageGapBps =
      targetLeverageBps > currentLeverageBps
        ? targetLeverageBps - currentLeverageBps // For increase leverage
        : currentLeverageBps - targetLeverageBps; // For decrease leverage

    const assetAmount =
      (totalAssets * leverageGapBps) / BigInt(ONE_HUNDRED_PERCENT_BPS);

    // Add 5% buffer to min price for slippage protection
    const minPriceInBase = (assetPriceInBase * BigInt(95)) / BigInt(100);

    try {
      const tx = await vault.increaseLeverage(assetAmount, minPriceInBase);
      await tx.wait();
      printLog(
        index,
        `Successfully increased leverage with ${assetAmount} assets`,
      );
    } catch (error: any) {
      printLog(index, `Failed to increase leverage: ${error.message}`);
    }
  } else if (currentLeverageBps > upperBoundBps) {
    // Need to decrease leverage
    printLog(index, "Position is overleveraged, decreasing leverage...");

    // Calculate dUSD amount to decrease leverage back to target
    const dusd = await hre.ethers.getContractAt(
      "ERC20",
      await vault.getDUSDAddress(),
    );
    const dusdDecimals = await dusd.decimals();
    const totalAssets = await vault.totalAssets();
    const leverageGapBps =
      currentLeverageBps > targetLeverageBps
        ? currentLeverageBps - targetLeverageBps
        : targetLeverageBps - currentLeverageBps;
    const dusdAmount =
      (((totalAssets * leverageGapBps * assetPriceInBase) /
        BigInt(ONE_HUNDRED_PERCENT_BPS)) *
        BigInt(10 ** Number(dusdDecimals))) /
      BigInt(10 ** 18); // Normalize decimals

    // Add 5% buffer to max price for slippage protection
    const maxPriceInBase = (assetPriceInBase * BigInt(105)) / BigInt(100);

    try {
      const tx = await vault.decreaseLeverage(dusdAmount, maxPriceInBase);
      await tx.wait();
      printLog(
        index,
        `Successfully decreased leverage with ${dusdAmount} dUSD`,
      );
    } catch (error: any) {
      printLog(index, `Failed to decrease leverage: ${error.message}`);
    }
  } else {
    printLog(index, "Position is balanced, no rebalancing needed");
  }
}

/**
 * Main entry point for the rebalancing bot
 */
async function main(): Promise<void> {
  const deployments = await hre.deployments.all();
  const vaultDeployments = Object.entries(deployments).filter(
    ([name]) =>
      name.startsWith("DLoopVaultCurve") ||
      name.startsWith("DLoopVaultUniswapV3"),
  );
  const dLoopVaultUniswapV3Addresses = vaultDeployments
    .filter(([name]) => name.startsWith("DLoopVaultUniswapV3"))
    .map(([_, deployment]) => deployment.address);
  const dLoopVaultCurveAddresses = vaultDeployments
    .filter(([name]) => name.startsWith("DLoopVaultCurve"))
    .map(([_, deployment]) => deployment.address);

  const vaultAddresses = [
    ...dLoopVaultUniswapV3Addresses,
    ...dLoopVaultCurveAddresses,
  ];

  let index = 1;

  while (true) {
    try {
      for (const vaultAddress of vaultAddresses) {
        const vault = await hre.ethers.getContractAt(
          "DLoopVaultBase",
          vaultAddress,
        );

        // Check if rebalancing is needed
        const isTooImbalanced = await vault.isTooImbalanced();

        if (isTooImbalanced) {
          printLog(index, `Vault ${vaultAddress} needs rebalancing`);
          await rebalance(vault, index);
        } else {
          printLog(index, `Vault ${vaultAddress} is balanced`);
        }
      }
    } catch (error: any) {
      console.error(`Error in iteration ${index}:`, error);
    }

    // Wait before next iteration
    await new Promise((resolve) => setTimeout(resolve, 5000));
    index++;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
