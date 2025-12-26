import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { ODOS_SWAP_LOGIC_ID } from "../../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";
import { DLOOP_DECREASE_LEVERAGE_ODOS_ID } from "../../../utils/vault/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  if (!dloopDeployer) {
    throw new Error("DLoopDeployer is not set in the named accounts");
  }

  // Skip local networks
  if (isLocalNetwork(hre.network.name)) {
    console.log("Skipping DLoopDecreaseLeverageOdos deployment on local network");
    return false;
  }

  // Get network config
  const config = await getConfig(hre);

  // Skip if no dLOOP configuration
  if (!config.dLoop) {
    console.log(`No dLOOP configuration defined for network ${hre.network.name}. Skipping Odos decrease leverage deployment.`);
    return false;
  }

  // Skip if no decrease leverage section or Odos decrease leverage is defined
  if (!config.dLoop.decreaseLeverage || !config.dLoop.decreaseLeverage.odos) {
    console.log(`Odos decrease leverage not defined for network ${hre.network.name}. Skipping.`);
    return false;
  }

  const odosConfig = config.dLoop.decreaseLeverage.odos;

  if (!odosConfig.router) {
    console.log(`Odos router not defined for network ${hre.network.name}. Skipping.`);
    return false;
  }

  console.log("Deploying DLoopDecreaseLeverageOdos...");

  // Get the dUSD token address from the configuration
  const dUSDAddress = config.dLoop.dUSDAddress;

  if (!dUSDAddress) {
    throw new Error("dUSD token address not found in configuration");
  }

  // Get the deployed OdosSwapLogic library address
  const { address: odosSwapLogicAddress } = await hre.deployments.get(ODOS_SWAP_LOGIC_ID);

  // Get the Odos Router address from configuration
  const odosRouterAddress = odosConfig.router;

  // Deploy DLoopDecreaseLeverageOdos
  await deployContract(
    hre,
    DLOOP_DECREASE_LEVERAGE_ODOS_ID,
    [
      dUSDAddress, // flashLenderAddress (dUSD is the flash lender)
      odosRouterAddress,
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dloopDeployer),
    {
      OdosSwapLogic: odosSwapLogicAddress,
    },
    "DLoopDecreaseLeverageOdos",
  );

  console.log("DLoopDecreaseLeverageOdos deployed successfully");
  return true;
};

func.id = DLOOP_DECREASE_LEVERAGE_ODOS_ID;
func.tags = ["dloop", "periphery", "odos", "decrease-leverage"];
func.dependencies = [ODOS_SWAP_LOGIC_ID];

export default func;
