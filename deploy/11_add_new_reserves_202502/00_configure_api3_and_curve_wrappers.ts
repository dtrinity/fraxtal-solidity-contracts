import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { TOKEN_INFO } from "../../config/networks/fraxtal_mainnet";
import { symbolsToAddresses } from "../../utils/token";
import { isMainnetNetwork } from "../../utils/utils";

const configureAssetsByOracleType = {
  api3WrapperWithThresholding: ["crvUSD", "FRAX"],
  compositeApi3OracleWrappersWithThresholding: ["scrvUSD", "sDAI"],
  curveApi3CompositeOracles: ["FXB20551231", "FXB20251231"],
};

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isMainnetNetwork(hre.network.name)) {
    console.log("This deployment is only for mainnet");
    return false;
  }

  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(dusdDeployer);

  const config = await getConfig(hre);

  const { address: api3OracleWrapperWithThresholdingAddress } =
    await hre.deployments.get("API3WrapperWithThresholding");
  const api3WrapperWithThresholding = await hre.ethers.getContractAt(
    "API3WrapperWithThresholding",
    api3OracleWrapperWithThresholdingAddress,
    deployer,
  );

  const thresholdAddresses = symbolsToAddresses(
    configureAssetsByOracleType.api3WrapperWithThresholding,
    TOKEN_INFO,
  );

  const thresholdFeeds = Object.fromEntries(
    Object.entries(
      config.oracleAggregator.api3OracleAssets
        .api3OracleWrappersWithThresholding,
    ).filter(([address]) => thresholdAddresses.includes(address)),
  );

  for (const [assetAddress, feedConfig] of Object.entries(thresholdFeeds)) {
    await api3WrapperWithThresholding.setProxy(assetAddress, feedConfig.proxy);
    await api3WrapperWithThresholding.setThresholdConfig(
      assetAddress,
      feedConfig.lowerThreshold,
      feedConfig.fixedPrice,
    );
    console.log(
      `Set API3 proxy with thresholding for asset ${assetAddress}:`,
      `\n  - Proxy: ${feedConfig.proxy}`,
      `\n  - Lower threshold: ${feedConfig.lowerThreshold}`,
      `\n  - Fixed price: ${feedConfig.fixedPrice}`,
    );
  }

  const { address: api3CompositeWrapperWithThresholdingAddress } =
    await hre.deployments.get("API3CompositeWrapperWithThresholding");
  const api3CompositeWrapper = await hre.ethers.getContractAt(
    "API3CompositeWrapperWithThresholding",
    api3CompositeWrapperWithThresholdingAddress,
    deployer,
  );

  const compositeAddresses = symbolsToAddresses(
    configureAssetsByOracleType.compositeApi3OracleWrappersWithThresholding,
    TOKEN_INFO,
  );
  const compositeFeeds = Object.fromEntries(
    Object.entries(
      config.oracleAggregator.api3OracleAssets
        .compositeApi3OracleWrappersWithThresholding,
    ).filter(([key]) => compositeAddresses.includes(key)),
  );

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

  const { address: curveCompositeWrapperWithThresholdingAddress } =
    await hre.deployments.get("CurveAPI3CompositeWrapperWithThresholding");
  const curveCompositeWrapper = await hre.ethers.getContractAt(
    "CurveAPI3CompositeWrapperWithThresholding",
    curveCompositeWrapperWithThresholdingAddress,
    deployer,
  );

  const curveAddresses = symbolsToAddresses(
    configureAssetsByOracleType.curveApi3CompositeOracles,
    TOKEN_INFO,
  );
  const curveCompositeFeeds = Object.fromEntries(
    Object.entries(
      config.oracleAggregator.curveOracleAssets.curveApi3CompositeOracles,
    ).filter(([key]) => curveAddresses.includes(key)),
  );

  for (const [assetAddress, feedConfig] of Object.entries(
    curveCompositeFeeds,
  )) {
    await curveCompositeWrapper.setAssetConfig(assetAddress, feedConfig.pool);
    console.log(
      `Set Curve pool config for asset ${assetAddress}:`,
      `\n  - Pool: ${feedConfig.pool}`,
    );

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

func.tags = ["oracle-wrapper", "api3-oracle-wrapper", "curve-oracle-wrapper"];
func.dependencies = [];
func.id = "DeployNewOracleWrappers202502";

export default func;
