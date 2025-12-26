import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { DLOOP_CORE_LOGIC_ID, DLOOP_QUOTER_ID } from "../../../utils/vault/deploy-ids";

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
    console.log(`No dLOOP configuration defined for network ${hre.network.name}. Skipping DLoopQuoter deployment.`);
    return false;
  }

  console.log(`Deploying DLoopQuoter on network ${hre.network.name} (chainId: ${chainId})`);

  const { address: dLoopCoreLogicAddress } = await hre.deployments.get(DLOOP_CORE_LOGIC_ID);

  await deployContract(
    hre,
    DLOOP_QUOTER_ID,
    [], // no constructor args
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dloopDeployer),
    {
      DLoopCoreLogic: dLoopCoreLogicAddress,
    },
    "DLoopQuoter",
  );

  return true;
};

func.id = DLOOP_QUOTER_ID;
func.tags = ["dloop", "core", "quoter"];
func.dependencies = [DLOOP_CORE_LOGIC_ID];

export default func;
