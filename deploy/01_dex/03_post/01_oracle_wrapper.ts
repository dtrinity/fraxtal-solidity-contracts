import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { AAVE_ORACLE_USD_DECIMALS } from "../../../utils/constants";
import { deployContract } from "../../../utils/deploy";
import { UNISWAP_STATIC_ORACLE_ID, UNISWAP_STATIC_ORACLE_WRAPPER_ID } from "../../../utils/dex/deploy-ids";
import { isLocalNetwork, isMainnetNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (isMainnetNetwork(hre.network.name)) {
    console.log("Skipping deployment on mainnet");
    return false;
  }

  const config = await getConfig(hre);

  // Skip deployment if dex config is not populated
  if (!config.dex) {
    console.log("Skipping Oracle Wrapper deployment - dex config not populated");
    return false;
  }

  const { dexDeployer } = await hre.getNamedAccounts();

  const baseTokenAddress = await getBaseTokenAddress(hre);

  const { address: staticOracleAddress } = await hre.deployments.get(UNISWAP_STATIC_ORACLE_ID);

  const baseTokenAmountForQuoting = config.dex.oracle.baseTokenAmountForQuoting;
  const quotePeriodSeconds = config.dex.oracle.quotePeriodSeconds;

  await deployContract(
    hre,
    UNISWAP_STATIC_ORACLE_WRAPPER_ID,
    [
      staticOracleAddress,
      baseTokenAddress,
      baseTokenAmountForQuoting.toString(), // use toString to avoid ethers Overflow error
      quotePeriodSeconds,
      // https://fraxscan.com/address/0x89e60b56efD70a1D4FBBaE947bC33cae41e37A72
      AAVE_ORACLE_USD_DECIMALS, // This is how many decimals Redstone uses
    ],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "StaticOracleWrapper",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

/**
 * Get the base token address for the oracle wrapper
 *
 * @param hre Hardhat runtime environment
 * @returns Base token address
 */
async function getBaseTokenAddress(hre: HardhatRuntimeEnvironment): Promise<string> {
  if (isLocalNetwork(hre.network.name)) {
    // Use dUSD for local networks
    const { address: baseTokenAddress } = await hre.deployments.get("dUSD");
    return baseTokenAddress;
  }

  const config = await getConfig(hre);

  if (!config.dex) {
    throw new Error(`DEX config is not set for network: ${hre.network.name}`);
  }
  const baseTokenAddress = config.dex.oracle.baseTokenAddress;

  if (!baseTokenAddress) {
    throw new Error(`Base token address is not set in the config: ${hre.network.name}`);
  }

  return baseTokenAddress;
}

func.id = UNISWAP_STATIC_ORACLE_WRAPPER_ID;
func.tags = ["dex", "dex-oracle"];
export default func;
