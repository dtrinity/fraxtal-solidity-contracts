import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { ODOS_SWAP_LOGIC_ID } from "../../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  if (!dloopDeployer) {
    throw new Error("DLoopDeployer is not set in the named accounts");
  }

  // Skip local networks
  if (isLocalNetwork(hre.network.name)) {
    console.log("Skipping OdosSwapLogic deployment on local network");
    return false;
  }

  // Skip if dLOOP Odos is not configured for this network
  const config = await getConfig(hre);
  const hasOdosConfig =
    config.dLoop &&
    ((config.dLoop.depositors && config.dLoop.depositors.odos) || (config.dLoop.withdrawers && config.dLoop.withdrawers.odos));

  if (!hasOdosConfig) {
    console.log(`No dLOOP Odos depositor/withdrawer defined for network ${hre.network.name}. Skipping OdosSwapLogic deployment.`);
    return false;
  }

  await deployContract(
    hre,
    ODOS_SWAP_LOGIC_ID,
    [], // no constructor arguments
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dloopDeployer),
    undefined, // no libraries
    "OdosSwapLogic",
  );

  // Return true to indicate the success of the deployment
  return true;
};

func.id = ODOS_SWAP_LOGIC_ID;
func.tags = ["dloop", "periphery", "odos", "swap-logic"];

export default func;
