import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import {
  API3_ORACLE_WRAPPER_ID,
  CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  // Get OracleAggregator contract
  const { address: oracleAggregatorAddress } = await hre.deployments.get(ORACLE_AGGREGATOR_ID);
  const oracleAggregatorContract = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Get API3Wrapper contract for plain feeds
  const { address: api3OracleWrapperAddress } = await hre.deployments.get(API3_ORACLE_WRAPPER_ID);
  const api3OracleWrapperContract = await hre.ethers.getContractAt(
    "API3Wrapper",
    api3OracleWrapperAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Set plain API3 oracle wrappers
  const plainFeeds = config.oracleAggregator.api3OracleAssets.plainApi3OracleWrappers;

  for (const [assetAddress, _proxyAddress] of Object.entries(plainFeeds)) {
    // Validate the new wrapper before pointing
    const testPrice = await api3OracleWrapperContract.getAssetPrice(assetAddress);

    if (testPrice == 0n) {
      throw new Error(`The API3 oracle wrapper has not been set for ${assetAddress}`);
    }
    console.log(`Pointing OracleAggregator for ${assetAddress} to`, api3OracleWrapperAddress);
    await oracleAggregatorContract.setOracle(assetAddress, api3OracleWrapperAddress);
  }

  // Get API3WrapperWithThresholding contract for feeds with thresholding
  const { address: api3WrapperWithThresholdingAddress } = await hre.deployments.get("API3WrapperWithThresholding");
  const api3WrapperWithThresholdingContract = await hre.ethers.getContractAt(
    "API3WrapperWithThresholding",
    api3WrapperWithThresholdingAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Set API3 oracle wrappers with thresholding
  const thresholdFeeds = config.oracleAggregator.api3OracleAssets.api3OracleWrappersWithThresholding;

  for (const [assetAddress, _feedConfig] of Object.entries(thresholdFeeds)) {
    // Validate the new wrapper before pointing
    const testPrice = await api3WrapperWithThresholdingContract.getAssetPrice(assetAddress);

    if (testPrice == 0n) {
      throw new Error(`The API3 oracle wrapper with thresholding has not been set for ${assetAddress}`);
    }
    console.log(`Pointing OracleAggregator for ${assetAddress} to`, api3WrapperWithThresholdingAddress);
    await oracleAggregatorContract.setOracle(assetAddress, api3WrapperWithThresholdingAddress);
  }

  // Get API3CompositeWrapperWithThresholding contract for composite feeds
  const { address: api3CompositeWrapperAddress } = await hre.deployments.get("API3CompositeWrapperWithThresholding");
  const api3CompositeWrapperContract = await hre.ethers.getContractAt(
    "API3CompositeWrapperWithThresholding",
    api3CompositeWrapperAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Set composite API3 oracle wrappers
  const compositeFeeds = config.oracleAggregator.api3OracleAssets.compositeApi3OracleWrappersWithThresholding;

  for (const [assetAddress, _feedConfig] of Object.entries(compositeFeeds)) {
    // Validate the new wrapper before pointing
    const testPrice = await api3CompositeWrapperContract.getAssetPrice(assetAddress);

    if (testPrice == 0n) {
      throw new Error(`The composite API3 oracle wrapper has not been set for ${assetAddress}`);
    }
    console.log(`Pointing OracleAggregator for ${assetAddress} to`, api3CompositeWrapperAddress);
    await oracleAggregatorContract.setOracle(assetAddress, api3CompositeWrapperAddress);
  }

  // Get CurveAPI3CompositeWrapperWithThresholding contract
  const { address: curveCompositeWrapperAddress } = await hre.deployments.get(CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID);
  const curveCompositeWrapperContract = await hre.ethers.getContractAt(
    CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
    curveCompositeWrapperAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Set Curve composite API3 oracle wrappers
  const curveCompositeFeeds = config.oracleAggregator.curveOracleAssets?.curveApi3CompositeOracles;

  for (const [assetAddress, _feedConfig] of Object.entries(curveCompositeFeeds)) {
    // Validate the new wrapper before pointing
    const testPrice = await curveCompositeWrapperContract.getAssetPrice(assetAddress);

    if (testPrice == 0n) {
      throw new Error(`The Curve composite API3 oracle wrapper has not been set for ${assetAddress}`);
    }
    console.log(`Pointing OracleAggregator for ${assetAddress} to`, curveCompositeWrapperAddress);
    await oracleAggregatorContract.setOracle(assetAddress, curveCompositeWrapperAddress);
  }

  return true;
};

func.tags = ["api3-migration-202501", "api3-pointing-202501", "oracle-aggregator", "point-api3-oracle-wrapper"];
func.dependencies = ["Api3MigrationSetupNewWrappers", ORACLE_AGGREGATOR_ID];
func.id = "Api3MigrationPointNewWrappers";

export default func;
