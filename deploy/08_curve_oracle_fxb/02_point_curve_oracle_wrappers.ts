import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import {
  CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  // Get OracleAggregator contract
  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);
  const oracleAggregator = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  const { address: curveWrapperAddress } = await hre.deployments.get(
    CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
  );
  const curveCompositeWrapper = await hre.ethers.getContractAt(
    "CurveAPI3CompositeWrapperWithThresholding",
    curveWrapperAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Set Curve oracle wrappers
  const curveFeeds =
    config.oracleAggregator.curveOracleAssets.curveApi3CompositeOracles || {};

  for (const [assetAddress, _feedConfig] of Object.entries(curveFeeds)) {
    // Verify the wrapper is properly configured
    const testPrice = await curveCompositeWrapper.getAssetPrice(assetAddress);

    if (testPrice == 0n) {
      throw new Error(
        `The Curve oracle wrapper has not been set for ${assetAddress}`,
      );
    }

    console.log(
      `Setting Curve oracle wrapper for ${assetAddress} to`,
      curveWrapperAddress,
    );
    await oracleAggregator.setOracle(assetAddress, curveWrapperAddress);
  }

  return true;
};

func.tags = ["point-curve-oracle-wrapper", "oracle-aggregator"];
func.dependencies = [ORACLE_AGGREGATOR_ID];
func.id = "PointCurveOracleWrapper";

export default func;
