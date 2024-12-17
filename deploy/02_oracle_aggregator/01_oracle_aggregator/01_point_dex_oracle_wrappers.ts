import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import {
  DEX_ORACLE_WRAPPER_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../../utils/oracle/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("This script is only for localhost network");
    return false;
  }

  const { dusdDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  // Get OracleAggregator contract
  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);
  const oracleAggregatorContract = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Set the oracle wrapper for DEX assets
  const { address: dexOracleWrapperAddress } = await hre.deployments.get(
    DEX_ORACLE_WRAPPER_ID,
  );
  const dexOracleWrapperContract = await hre.ethers.getContractAt(
    "DexOracleWrapper",
    dexOracleWrapperAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  for (const assetAddress in config.oracleAggregator.dexOracleAssets) {
    if (assetAddress == config.oracleAggregator.dUSDAddress) {
      throw new Error(
        `The asset address ${assetAddress} is already set for dUSD`,
      );
    }

    // Check that the DEX oracle wrapper has indeed been set for this asset
    if (!isLocalNetwork(hre.network.name)) {
      // Note that we don't check for local networks because the DEX pools aren't initially set
      const testPrice =
        await dexOracleWrapperContract.getAssetPrice(assetAddress);

      if (testPrice == 0n) {
        throw new Error(
          `The DEX oracle wrapper has not been set for ${assetAddress}`,
        );
      }
    }

    console.log(
      `Setting DEX oracle wrapper for ${assetAddress} to`,
      dexOracleWrapperAddress,
    );
    await oracleAggregatorContract.setOracle(
      assetAddress,
      dexOracleWrapperAddress,
    );
  }

  return true;
};

func.tags = ["point-dex-oracle-wrapper", "oracle-aggregator"];
func.dependencies = [ORACLE_AGGREGATOR_ID];
func.id = "POINT_DEX_ORACLE_WRAPPER";

export default func;
