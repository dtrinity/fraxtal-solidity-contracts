import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../../utils/deploy";
import { UNISWAP_INTERFACE_MULTICALL_ID } from "../../../utils/dex/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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
func.tags = ["dex", "periphery"];
export default func;
