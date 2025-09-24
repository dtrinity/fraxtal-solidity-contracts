import hre, { ethers } from "hardhat";

import { ORACLE_ID } from "../../utils/lending/deploy-ids";
import { AssetSourcesConfig } from "./type";

/**
 * Sets price feed sources for assets in the Aave Oracle contract.
 * Takes a JSON file path from environment variable 'dataFile' containing {@link AssetSourcesConfig} data structure.
 * Validates the addresses and sets the price feed sources in the Oracle contract.
 *
 * @returns Promise that resolves when sources are set
 */
async function main(): Promise<void> {
  const inputJsonPath = process.env.dataFile;
  console.log("Your input", inputJsonPath);

  if (!inputJsonPath) {
    console.error("Invalid input format. Please provide valid JSON file path.");
    process.exit(1);
  }

  const fs = require("fs");

  const rawData = fs.readFileSync(inputJsonPath);
  const parsedData = JSON.parse(rawData) as AssetSourcesConfig;

  const { assets, sources } = parsedData;

  if (!Array.isArray(assets) || !Array.isArray(sources)) {
    throw new Error("Invalid input format. Assets and sources must be arrays.");
  }

  // Validate addresses
  assets.forEach((asset: string) => {
    if (!ethers.isAddress(asset)) {
      throw new Error(`Invalid asset address format: ${asset}`);
    }
  });

  sources.forEach((source: string) => {
    if (!ethers.isAddress(source)) {
      throw new Error(`Invalid source address format: ${source}`);
    }
  });

  // Validate input arrays
  if (assets.length !== sources.length) {
    throw new Error("Assets and sources arrays must have the same length");
  }

  try {
    const { lendingDeployer } = await hre.getNamedAccounts();
    const admin = await hre.ethers.getSigner(lendingDeployer);
    const { address: aaveOracleAddress } = await hre.deployments.get(ORACLE_ID);

    const oracle = await ethers.getContractAt("AaveOracle", aaveOracleAddress, admin);

    // Set asset sources
    console.log("Setting asset sources...");
    const tx = await oracle.setAssetSources(assets, sources);
    await tx.wait();

    console.log("Successfully updated asset sources");

    // Verify the updates
    console.log("\nVerifying updates:");

    for (let i = 0; i < assets.length; i++) {
      const source = await oracle.getSourceOfAsset(assets[i]);
      console.log(`Asset ${assets[i]}: ${source}`);
    }
  } catch (error) {
    console.error("Error setting asset sources:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
