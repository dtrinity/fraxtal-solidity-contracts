import hre, { ethers } from "hardhat";

import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";

interface ThresholdConfig {
  asset: string;
  api3Asset: string;
  api3Wrapper: string;
  curveLowerThresholdInBase: bigint;
  curveFixedPriceInBase: bigint;
  api3LowerThresholdInBase: bigint;
  api3FixedPriceInBase: bigint;
}

// Edit this configuration before running the script
const THRESHOLD_CONFIG: ThresholdConfig[] = [
  {
    // FXB20291231
    asset: "0xf1e2b576af4c6a7ee966b14c810b772391e92153",
    // FRAX
    api3Asset: "0xfc00000000000000000000000000000000000001",
    // FRAX/USD API3 wrapper
    api3Wrapper: "0xF6eA02D055d832cc491B47238186768B7F6d2F42",
    // Don't allow FXB20291231 to go above maturity value
    curveLowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
    curveFixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
    // Don't allow FRAX to go above $1
    api3LowerThresholdInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
    api3FixedPriceInBase: 1n * 10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
  },
];

/**
 * Updates threshold configuration for assets in the CurveAPI3CompositeWrapperWithThresholding contract.
 * Edit the THRESHOLD_CONFIG array above before running this script.
 *
 * @returns Promise that resolves when thresholds are updated
 */
async function main(): Promise<void> {
  // Validate addresses and thresholds
  THRESHOLD_CONFIG.forEach((config: ThresholdConfig) => {
    if (!ethers.isAddress(config.asset)) {
      throw new Error(`Invalid asset address format: ${config.asset}`);
    }

    if (!ethers.isAddress(config.api3Asset)) {
      throw new Error(`Invalid API3 asset address format: ${config.api3Asset}`);
    }

    if (!ethers.isAddress(config.api3Wrapper)) {
      throw new Error(
        `Invalid API3 wrapper address format: ${config.api3Wrapper}`,
      );
    }
  });

  try {
    const { dusdDeployer } = await hre.getNamedAccounts();
    const admin = await hre.ethers.getSigner(dusdDeployer);
    const { address: wrapperAddress } = await hre.deployments.get(
      "CurveAPI3CompositeWrapperWithThresholding",
    );

    const wrapper = await ethers.getContractAt(
      "CurveAPI3CompositeWrapperWithThresholding",
      wrapperAddress,
      admin,
    );

    // Update thresholds for each asset
    console.log("Updating threshold configurations...");

    for (const config of THRESHOLD_CONFIG) {
      console.log(`\nUpdating thresholds for asset: ${config.asset}`);
      const tx = await wrapper.setCompositeFeed(
        config.asset,
        config.api3Asset,
        config.api3Wrapper,
        config.curveLowerThresholdInBase,
        config.curveFixedPriceInBase,
        config.api3LowerThresholdInBase,
        config.api3FixedPriceInBase,
      );
      await tx.wait();
      console.log("Successfully updated thresholds");
    }

    // Verify the updates
    console.log("\nVerifying updates:");

    for (const config of THRESHOLD_CONFIG) {
      const feed = await wrapper.compositeFeeds(config.asset);
      console.log(`Asset ${config.asset}:`);
      console.log(`  API3 Asset: ${feed.api3Asset}`);
      console.log(`  API3 Wrapper: ${feed.api3Wrapper}`);
      console.log(
        `  Curve Lower Threshold: ${feed.thresholds.primary.lowerThresholdInBase}`,
      );
      console.log(
        `  Curve Fixed Price: ${feed.thresholds.primary.fixedPriceInBase}`,
      );
      console.log(
        `  API3 Lower Threshold: ${feed.thresholds.secondary.lowerThresholdInBase}`,
      );
      console.log(
        `  API3 Fixed Price: ${feed.thresholds.secondary.fixedPriceInBase}`,
      );
    }
  } catch (error) {
    console.error("Error updating threshold configuration:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
