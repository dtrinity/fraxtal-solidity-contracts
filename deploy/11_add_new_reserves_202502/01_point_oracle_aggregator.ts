import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { TOKEN_INFO } from "../../config/networks/fraxtal_mainnet";
import {
  CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../utils/oracle/deploy-ids";
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

  // Get OracleAggregator contract
  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);
  const oracleAggregatorContract = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    deployer,
  );

  // Get API3WrapperWithThresholding contract for feeds with thresholding
  const { address: api3WrapperWithThresholdingAddress } =
    await hre.deployments.get("API3WrapperWithThresholding");
  const api3WrapperWithThresholdingContract = await hre.ethers.getContractAt(
    "API3WrapperWithThresholding",
    api3WrapperWithThresholdingAddress,
    deployer,
  );

  // Set API3 oracle wrappers with thresholding
  const thresholdAddresses = symbolsToAddresses(
    configureAssetsByOracleType.api3WrapperWithThresholding,
    TOKEN_INFO,
  );
  const thresholdFeeds = Object.fromEntries(
    Object.entries(
      config.oracleAggregator.api3OracleAssets
        .api3OracleWrappersWithThresholding,
    ).filter(([key]) => thresholdAddresses.includes(key)),
  );

  for (const [assetAddress, _feedConfig] of Object.entries(thresholdFeeds)) {
    // Validate the new wrapper before pointing
    const testPrice =
      await api3WrapperWithThresholdingContract.getAssetPrice(assetAddress);

    if (testPrice == 0n) {
      throw new Error(
        `The API3 oracle wrapper with thresholding has not been set for ${assetAddress}`,
      );
    }
    console.log(
      `Pointing OracleAggregator for ${assetAddress} to`,
      api3WrapperWithThresholdingAddress,
    );
    await oracleAggregatorContract.setOracle(
      assetAddress,
      api3WrapperWithThresholdingAddress,
    );
  }

  // Get API3CompositeWrapperWithThresholding contract for composite feeds
  const { address: api3CompositeWrapperAddress } = await hre.deployments.get(
    "API3CompositeWrapperWithThresholding",
  );
  const api3CompositeWrapperContract = await hre.ethers.getContractAt(
    "API3CompositeWrapperWithThresholding",
    api3CompositeWrapperAddress,
    deployer,
  );

  // Set composite API3 oracle wrappers
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

  for (const [assetAddress, _feedConfig] of Object.entries(compositeFeeds)) {
    // Validate the new wrapper before pointing
    const testPrice =
      await api3CompositeWrapperContract.getAssetPrice(assetAddress);

    if (testPrice == 0n) {
      throw new Error(
        `The composite API3 oracle wrapper has not been set for ${assetAddress}`,
      );
    }
    console.log(
      `Pointing OracleAggregator for ${assetAddress} to`,
      api3CompositeWrapperAddress,
    );
    await oracleAggregatorContract.setOracle(
      assetAddress,
      api3CompositeWrapperAddress,
    );
  }

  // Get CurveAPI3CompositeWrapperWithThresholding contract
  const { address: curveCompositeWrapperAddress } = await hre.deployments.get(
    CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
  );
  const curveCompositeWrapperContract = await hre.ethers.getContractAt(
    CURVE_API3_COMPOSITE_WRAPPER_WITH_THRESHOLDING_ID,
    curveCompositeWrapperAddress,
    deployer,
  );

  // Set Curve composite API3 oracle wrappers
  const curveAddresses = symbolsToAddresses(
    configureAssetsByOracleType.curveApi3CompositeOracles,
    TOKEN_INFO,
  );
  const curveCompositeFeeds = Object.fromEntries(
    Object.entries(
      config.oracleAggregator.curveOracleAssets.curveApi3CompositeOracles,
    ).filter(([key]) => curveAddresses.includes(key)),
  );

  for (const [assetAddress, _feedConfig] of Object.entries(
    curveCompositeFeeds,
  )) {
    // Validate the new wrapper before pointing
    const testPrice =
      await curveCompositeWrapperContract.getAssetPrice(assetAddress);

    if (testPrice == 0n) {
      throw new Error(
        `The Curve composite API3 oracle wrapper has not been set for ${assetAddress}`,
      );
    }
    console.log(
      `Pointing OracleAggregator for ${assetAddress} to`,
      curveCompositeWrapperAddress,
    );
    await oracleAggregatorContract.setOracle(
      assetAddress,
      curveCompositeWrapperAddress,
    );
  }

  return true;
};

func.tags = [
  "oracle-aggregator",
  "point-api3-oracle-wrapper",
  "point-curve-oracle-wrapper",
];
func.dependencies = ["DeployNewOracleWrappers202502", ORACLE_AGGREGATOR_ID];
func.id = "PointNewOracleWrappers202502";

export default func;
