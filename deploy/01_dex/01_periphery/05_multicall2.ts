import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { UNISWAP_INTERFACE_MULTICALL_ID } from "../../../utils/dex/deploy-ids";
import { isMainnetNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (isMainnetNetwork(hre.network.name)) {
    console.log("Skipping deployment on mainnet");
    return false;
  }

  const config = await getConfig(hre);

  // Skip deployment if dex config is not populated
  if (!config.dex) {
    console.log("Skipping Uniswap Interface Multicall deployment - dex config not populated");
    return false;
  }
  const { dexDeployer } = await hre.getNamedAccounts();

  // The UniswapInterfaceMulticall will be automatically found in contracts/**/*/.sol
  await deployContract(
    hre,
    UNISWAP_INTERFACE_MULTICALL_ID,
    [],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "UniswapInterfaceMulticall",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = UNISWAP_INTERFACE_MULTICALL_ID;
func.tags = ["dex", "dex-periphery"];
export default func;
