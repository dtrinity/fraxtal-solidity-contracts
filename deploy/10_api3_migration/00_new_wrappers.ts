import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import { API3_ORACLE_WRAPPER_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(dusdDeployer);

  const config = await getConfig(hre);
  const baseCurrencyUnit = BigInt(10) ** BigInt(config.oracleAggregator.priceDecimals);

  // Deploy API3Wrapper for plain oracle feeds (overwriting existing deployment)
  const api3WrapperDeployment = await deployContract(
    hre,
    API3_ORACLE_WRAPPER_ID,
    [baseCurrencyUnit],
    undefined,
    deployer,
    undefined,
    API3_ORACLE_WRAPPER_ID, // Use original ID to overwrite
  );

  const api3Wrapper = await hre.ethers.getContractAt(API3_ORACLE_WRAPPER_ID, api3WrapperDeployment.address);

  // Set proxies for plain oracle feeds
  const plainFeeds = config.oracleAggregator.api3OracleAssets.plainApi3OracleWrappers;

  for (const [assetAddress, proxyAddress] of Object.entries(plainFeeds)) {
    await api3Wrapper.setProxy(assetAddress, proxyAddress);
    console.log(`Set plain API3 proxy for asset ${assetAddress} to ${proxyAddress}`);
  }

  // Deploy API3WrapperWithThresholding for feeds with thresholding (new deployment)
  const api3WrapperWithThresholdingDeployment = await deployContract(
    hre,
    "API3WrapperWithThresholding",
    [baseCurrencyUnit],
    undefined,
    deployer,
    undefined,
    "API3WrapperWithThresholding",
  );

  const api3WrapperWithThresholding = await hre.ethers.getContractAt(
    "API3WrapperWithThresholding",
    api3WrapperWithThresholdingDeployment.address,
  );

  // Set proxies and thresholds for feeds with thresholding
  const thresholdFeeds = config.oracleAggregator.api3OracleAssets.api3OracleWrappersWithThresholding;

  for (const [assetAddress, feedConfig] of Object.entries(thresholdFeeds)) {
    await api3WrapperWithThresholding.setProxy(assetAddress, feedConfig.proxy);
    await api3WrapperWithThresholding.setThresholdConfig(assetAddress, feedConfig.lowerThreshold, feedConfig.fixedPrice);
    console.log(
      `Set API3 proxy with thresholding for asset ${assetAddress}:`,
      `\n  - Proxy: ${feedConfig.proxy}`,
      `\n  - Lower threshold: ${feedConfig.lowerThreshold}`,
      `\n  - Fixed price: ${feedConfig.fixedPrice}`,
    );
  }

  // Deploy API3CompositeWrapperWithThresholding for composite feeds (overwriting existing deployment)
  const api3CompositeWrapperDeployment = await deployContract(
    hre,
    "API3CompositeWrapperWithThresholding",
    [baseCurrencyUnit],
    undefined,
    deployer,
    undefined,
    "API3CompositeWrapperWithThresholding", // Use original name to overwrite
  );

  const api3CompositeWrapper = await hre.ethers.getContractAt(
    "API3CompositeWrapperWithThresholding",
    api3CompositeWrapperDeployment.address,
  );

  // Add composite feeds
  const compositeFeeds = config.oracleAggregator.api3OracleAssets.compositeApi3OracleWrappersWithThresholding;

  for (const [assetAddress, feedConfig] of Object.entries(compositeFeeds)) {
    await api3CompositeWrapper.addCompositeFeed(
      feedConfig.feedAsset,
      feedConfig.proxy1,
      feedConfig.proxy2,
      feedConfig.lowerThresholdInBase1,
      feedConfig.fixedPriceInBase1,
      feedConfig.lowerThresholdInBase2,
      feedConfig.fixedPriceInBase2,
    );
    console.log(
      `Set composite API3 feed for asset ${assetAddress} with:`,
      `\n  - Proxy1: ${feedConfig.proxy1}`,
      `\n  - Proxy2: ${feedConfig.proxy2}`,
      `\n  - Lower threshold in base1: ${feedConfig.lowerThresholdInBase1}`,
      `\n  - Fixed price in base1: ${feedConfig.fixedPriceInBase1}`,
      `\n  - Lower threshold in base2: ${feedConfig.lowerThresholdInBase2}`,
      `\n  - Fixed price in base2: ${feedConfig.fixedPriceInBase2}`,
    );
  }

  // Deploy CurveAPI3CompositeWrapperWithThresholding (overwriting existing deployment)
  const curveCompositeWrapperDeployment = await deployContract(
    hre,
    "CurveAPI3CompositeWrapperWithThresholding",
    [baseCurrencyUnit],
    undefined,
    deployer,
    undefined,
    "CurveAPI3CompositeWrapperWithThresholding", // Use original name to overwrite
  );

  const curveCompositeWrapper = await hre.ethers.getContractAt(
    "CurveAPI3CompositeWrapperWithThresholding",
    curveCompositeWrapperDeployment.address,
  );

  // Configure Curve pools and thresholds
  const curveCompositeFeeds = config.oracleAggregator.curveOracleAssets.curveApi3CompositeOracles;

  for (const [assetAddress, feedConfig] of Object.entries(curveCompositeFeeds)) {
    // Set pool configuration
    await curveCompositeWrapper.setAssetConfig(assetAddress, feedConfig.pool);
    console.log(`Set Curve pool config for asset ${assetAddress}:`, `\n  - Pool: ${feedConfig.pool}`);

    // Set API3 feed configuration
    await curveCompositeWrapper.setCompositeFeed(
      assetAddress,
      feedConfig.compositeAPI3Feed.api3Asset,
      feedConfig.compositeAPI3Feed.api3Proxy,
      feedConfig.compositeAPI3Feed.curveLowerThresholdInBase,
      feedConfig.compositeAPI3Feed.curveFixedPriceInBase,
      feedConfig.compositeAPI3Feed.api3LowerThresholdInBase,
      feedConfig.compositeAPI3Feed.api3FixedPriceInBase,
    );
    console.log(
      `Set Curve composite API3 feed for asset ${assetAddress}:`,
      `\n  - API3 asset: ${feedConfig.compositeAPI3Feed.api3Asset}`,
      `\n  - API3 wrapper: ${feedConfig.compositeAPI3Feed.api3Proxy}`,
      `\n  - Curve lower threshold: ${feedConfig.compositeAPI3Feed.curveLowerThresholdInBase}`,
      `\n  - Curve fixed price: ${feedConfig.compositeAPI3Feed.curveFixedPriceInBase}`,
      `\n  - API3 lower threshold: ${feedConfig.compositeAPI3Feed.api3LowerThresholdInBase}`,
      `\n  - API3 fixed price: ${feedConfig.compositeAPI3Feed.api3FixedPriceInBase}`,
    );
  }

  return true;
};

func.tags = ["api3-migration-202501", "api3-wrapper-deployment-202501", "oracle-wrapper", "api3-oracle-wrapper"];
func.dependencies = [];
func.id = "Api3MigrationSetupNewWrappers";

export default func;
