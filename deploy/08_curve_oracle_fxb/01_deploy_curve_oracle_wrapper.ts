import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import { CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(dusdDeployer);

  const config = await getConfig(hre);
  const baseCurrencyUnit =
    BigInt(10) ** BigInt(config.oracleAggregator.priceDecimals);

  const wrapperDeployment = await deployContract(
    hre,
    CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
    [baseCurrencyUnit],
    undefined, // auto-filled gas limit
    deployer,
    undefined, // no library
    "CurveAPI3CompositeWrapperWithThresholding",
  );

  const wrapper = await hre.ethers.getContractAt(
    CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
    wrapperDeployment.address,
  );

  // Configure Curve pools and thresholds
  const curveFeeds = config.oracleAggregator.curveOracleAssets || {};

  for (const [assetAddress, feedConfig] of Object.entries(curveFeeds)) {
    // Set pool configuration
    await wrapper.setAssetConfig(assetAddress, feedConfig.pool);
    console.log(
      `Set Curve pool config for asset ${assetAddress}:`,
      `\n  - Pool: ${feedConfig.pool}`,
    );

    // Set API3 feed if configured
    if (feedConfig.compositeAPI3Feed) {
      await wrapper.setCompositeFeed(
        assetAddress,
        feedConfig.compositeAPI3Feed.api3Asset,
        feedConfig.compositeAPI3Feed.api3Wrapper,
        feedConfig.compositeAPI3Feed.curveLowerThresholdInBase,
        feedConfig.compositeAPI3Feed.curveFixedPriceInBase,
        feedConfig.compositeAPI3Feed.api3LowerThresholdInBase,
        feedConfig.compositeAPI3Feed.api3FixedPriceInBase,
      );
      console.log(
        `Set composite API3 feed for asset ${assetAddress}:`,
        `\n  - API3 asset: ${feedConfig.compositeAPI3Feed.api3Asset}`,
        `\n  - API3 wrapper: ${feedConfig.compositeAPI3Feed.api3Wrapper}`,
        `\n  - Curve lower threshold: ${feedConfig.compositeAPI3Feed.curveLowerThresholdInBase}`,
        `\n  - Curve fixed price: ${feedConfig.compositeAPI3Feed.curveFixedPriceInBase}`,
        `\n  - API3 lower threshold: ${feedConfig.compositeAPI3Feed.api3LowerThresholdInBase}`,
        `\n  - API3 fixed price: ${feedConfig.compositeAPI3Feed.api3FixedPriceInBase}`,
      );
    }
  }

  return true;
};

func.tags = ["oracle-aggregator", "oracle-wrapper", "curve-oracle-wrapper"];
func.dependencies = [];
func.id = CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID;

export default func;
