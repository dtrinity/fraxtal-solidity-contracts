import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { DLOOP_CORE_LOGIC_ID } from "../../../utils/vault/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  if (!dloopDeployer) {
    throw new Error("DLoopDeployer is not set in the named accounts");
  }

  const chainId = await hre.getChainId();

  // Get network config
  const config = await getConfig(hre);

  // Skip if no dLOOP configuration
  if (!config.dLoop) {
    console.log(`No dLOOP configuration defined for network ${hre.network.name}. Skipping DLoopCoreLogic deployment.`);
    return false;
  }

  console.log(`Deploying DLoopCoreLogic on network ${hre.network.name} (chainId: ${chainId})`);

  await deployContract(
    hre,
    DLOOP_CORE_LOGIC_ID,
    [], // no constructor args
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dloopDeployer),
    undefined, // no libraries
    "DLoopCoreLogic",
  );

  return true;
};

func.id = DLOOP_CORE_LOGIC_ID;
func.tags = ["dloop", "core", "logic"];

export default func;
