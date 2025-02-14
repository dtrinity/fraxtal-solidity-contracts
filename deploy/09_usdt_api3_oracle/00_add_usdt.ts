import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/networks/fraxtal_mainnet";
import {
  API3_ORACLE_WRAPPER_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../utils/oracle/deploy-ids";
import { isMainnetNetwork } from "../../utils/utils";

/**
 * Sets up API3 oracle proxy for USDT.
 * This script configures the API3Wrapper contract with USDT-oracle pairing.
 *
 * @param hre Hardhat Runtime Environment object
 * @returns true if the deployment was successful
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isMainnetNetwork(hre.network.name)) {
    console.log("This deployment is only for mainnet");
    return false;
  }

  const { dusdDeployer } = await hre.getNamedAccounts();

  // Get the network configuration
  const config = await getConfig(hre);
  const { TOKEN_INFO } = await import("../../config/networks/fraxtal_mainnet");

  // Get USDT configuration from the network config
  const usdtAddress = TOKEN_INFO.USDT.address;
  const usdtOracleAddress =
    config.oracleAggregator.api3OracleAssets.plainApi3OracleWrappers[
      usdtAddress
    ];

  if (!usdtOracleAddress) {
    throw new Error("USDT oracle address not found in config");
  }

  // API3Wrapper contract address
  const { address: api3WrapperAddress } = await hre.deployments.get(
    API3_ORACLE_WRAPPER_ID,
  );

  // Get the API3Wrapper contract instance
  const api3Wrapper = await hre.ethers.getContractAt(
    "API3Wrapper",
    api3WrapperAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  console.log(`Setting proxy for USDT...`);
  await api3Wrapper.setProxy(usdtAddress, usdtOracleAddress);
  console.log(
    `Proxy set for USDT: Asset ${usdtAddress}, Oracle ${usdtOracleAddress}`,
  );

  // Verify the proxy was set correctly
  const testPrice = await api3Wrapper.getAssetPrice(usdtAddress);

  if (testPrice == 0n) {
    throw new Error(`The API3 oracle wrapper has not been set for USDT`);
  }

  console.log("USDT proxy has been set successfully.");

  // Get the OracleAggregator contract instance
  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);
  const oracleAggregator = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Point the OracleAggregator to the API3Wrapper for USDT
  console.log(`Setting OracleAggregator for USDT...`);
  await oracleAggregator.setOracle(usdtAddress, api3WrapperAddress);
  console.log(
    `OracleAggregator set for USDT: Asset ${usdtAddress}, Oracle ${api3WrapperAddress}`,
  );

  // Verify the OracleAggregator was set correctly
  const aggregatorTestPrice = await oracleAggregator.getAssetPrice(usdtAddress);

  if (aggregatorTestPrice == 0n) {
    throw new Error(`The OracleAggregator has not been set for USDT`);
  }

  console.log("USDT OracleAggregator has been set successfully.");
  return true;
};

func.tags = [
  "point-api3-oracle-wrapper",
  "oracle-aggregator",
  "point-api3-usdt",
];
func.dependencies = [API3_ORACLE_WRAPPER_ID, ORACLE_AGGREGATOR_ID];
func.id = "PointApi3UsdtOracleWrapper";

export default func;
