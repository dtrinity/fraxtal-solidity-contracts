/* eslint-disable no-console */
import hre from "hardhat";
import { ethers } from "hardhat";
import path from "path";

/**
 * Utility script: prints latest prices for all on-chain oracle deployments on a given Hardhat network.
 *
 * Usage examples:
 *   yarn hardhat run --network sonic_mainnet scripts/oracle/show_oracle_prices.ts
 *   yarn hardhat run --network sonic_testnet scripts/oracle/show_oracle_prices.ts
 *
 * The script walks the hardhat-deploy deployments directory for the selected network, tries to
 * attach the minimal Chainlink AggregatorV3 interface and prints {name, description, price, updatedAt}.
 * Non-aggregator contracts are silently skipped.
 */

/** Helper: dynamically import the network config and build Config object */
async function loadNetworkConfig() {
  const networkName = hre.network.name;
  try {
    // Example path: ../../config/networks/sonic_mainnet.ts (relative to this script file)
    const configPath = path.resolve(
      __dirname,
      "../../config/networks",
      `${networkName}.ts`,
    );

    const configModule = await import(configPath);
    if (typeof configModule.getConfig !== "function") {
      console.warn(
        `Config module for ${networkName} does not export getConfig – skipping aggregator section`,
      );
      return undefined;
    }
    const config = await configModule.getConfig(hre);
    return config;
  } catch (err) {
    console.warn(
      `⚠️  Could not load network config for ${networkName}: ${(err as Error).message}`,
    );
    return undefined;
  }
}

/** Retrieve the (singular) OracleAggregator deployment */
async function getOracleAggregatorContract() {
  try {
    const dep = await hre.deployments.get("OracleAggregator");
    const AGGREGATOR_ABI = [
      "function getAssetPrice(address) view returns (uint256)",
    ];
    return await ethers.getContractAt(AGGREGATOR_ABI, dep.address);
  } catch {
    return undefined;
  }
}

/** Utility: pretty print aggregator prices */
async function dumpAggregatorPrices(): Promise<void> {
  const config = await loadNetworkConfig();
  if (!config || !config.oracleAggregator) return;

  const aggregatorContract = await getOracleAggregatorContract();
  if (!aggregatorContract) {
    console.log("❌ No deployment found for OracleAggregator");
    return;
  }

  // Collect asset addresses from the various config buckets
  const assetSet = new Set<string>();

  const addKeys = (obj?: Record<string, any>) => {
    if (!obj) return;
    for (const k of Object.keys(obj)) {
      if (k) assetSet.add(k.toLowerCase());
    }
  };

  const aggCfg = config.oracleAggregator;

  // Core assets
  if (aggCfg.dUSDAddress) assetSet.add(aggCfg.dUSDAddress.toLowerCase());

  // DEX oracle assets (simple map asset -> wrapper)
  addKeys(aggCfg.dexOracleAssets);

  // API3
  addKeys(aggCfg.api3OracleAssets?.plainApi3OracleWrappers);
  addKeys(aggCfg.api3OracleAssets?.api3OracleWrappersWithThresholding);
  addKeys(aggCfg.api3OracleAssets?.compositeApi3OracleWrappersWithThresholding);

  // Curve composite oracles
  addKeys(aggCfg.curveOracleAssets?.curveApi3CompositeOracles);

  if (assetSet.size === 0) {
    console.log(
      "No assets configured for OracleAggregator – skipping section\n",
    );
    return;
  }

  // Build address -> symbol map using lending reserve asset addresses
  const tokenAddressMap: Record<string, string> = Object.entries(
    (config.lending?.reserveAssetAddresses ?? {}) as Record<string, any>,
  ).reduce(
    (acc, [symbol, addr]) => {
      if (addr) acc[(addr as string).toLowerCase()] = symbol;
      return acc;
    },
    {} as Record<string, string>,
  );

  const decimals = aggCfg.priceDecimals ?? 18;

  console.log("\n📊 OracleAggregator Asset Prices");
  console.log("============================================================\n");

  for (const assetAddrLower of assetSet) {
    try {
      const rawPrice = await aggregatorContract.getAssetPrice(assetAddrLower);
      const priceHuman = ethers.formatUnits(rawPrice, decimals);
      const symbol = tokenAddressMap[assetAddrLower] || assetAddrLower;
      console.log(`  ${symbol.padEnd(15)} : ${priceHuman}`);
    } catch (err) {
      console.warn(
        `  ⚠️  Could not fetch price for ${assetAddrLower}: ${(err as Error).message}`,
      );
    }
  }
  console.log("------------------------------------------------------------");
}

async function main(): Promise<void> {
  // 1. Load all deployments for the current network via hardhat-deploy
  const deployments = await hre.deployments.all();
  const networkName = hre.network.name;

  console.log(`\n🔍 Custom Oracle Prices for ${networkName}`);
  console.log("============================================================\n");

  // Minimal ABI for Chainlink-style aggregator or our wrappers (they follow the same interface)
  const AGGREGATOR_ABI = [
    "function decimals() view returns (uint8)",
    "function description() view returns (string)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  ];

  const entries = Object.entries(deployments);

  // Helper to decide whether a deployment looks like an oracle (naive pattern match)
  const looksLikeOracle = (name: string): boolean =>
    /Oracle|Wrapper|Converter|HardPegOracle|Aggregator/i.test(name);

  for (const [name, deployment] of entries) {
    if (!looksLikeOracle(name)) {
      continue; // skip non-oracle contracts early
    }

    const { address } = deployment;
    if (!address || address === ethers.ZeroAddress) {
      continue;
    }

    try {
      const aggregator = await ethers.getContractAt(AGGREGATOR_ABI, address);

      // These calls are read-only and inexpensive
      const [decimals, description] = await Promise.all([
        aggregator.decimals(),
        aggregator.description().catch(() => ""),
      ]);

      // latestRoundData returns (uint80,int256,uint256,uint256,uint80)
      const [, answer, , updatedAt] = await aggregator.latestRoundData();

      const priceHuman = ethers.formatUnits(answer, decimals);
      const updatedIso = new Date(Number(updatedAt) * 1000).toISOString();

      console.log(`${name} @ ${address}`);
      console.log(`  description : ${description}`);
      console.log(`  decimals    : ${decimals}`);
      console.log(`  price       : ${priceHuman}`);
      console.log(`  updatedAt   : ${updatedIso}`);
      console.log(
        "------------------------------------------------------------",
      );
    } catch (err) {
      // The contract might not conform to the interface – skip quietly.
      // Uncomment next line for troubleshooting.
      // console.warn(`Skipping ${name}: ${(err as Error).message}`);
    }
  }

  // After raw oracle printout, show aggregator prices
  await dumpAggregatorPrices();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
