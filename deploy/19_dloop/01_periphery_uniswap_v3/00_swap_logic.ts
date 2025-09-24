import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { UNISWAP_V3_SWAP_LOGIC_ID } from "../../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  if (!dloopDeployer) {
    throw new Error("DLoopDeployer is not set in the named accounts");
  }

  // Skip local networks
  if (isLocalNetwork(hre.network.name)) {
    console.log("Skipping UniswapV3SwapLogic deployment on local network");
    return false;
  }

  // Skip if dLOOP UniswapV3 is not configured for this network
  const config = await getConfig(hre);
  const hasUniswapV3Config =
    config.dLoop &&
    ((config.dLoop.depositors && config.dLoop.depositors.uniswapV3) || (config.dLoop.withdrawers && config.dLoop.withdrawers.uniswapV3));

  if (!hasUniswapV3Config) {
    console.log(`No dLOOP UniswapV3 depositor/withdrawer defined for network ${hre.network.name}. Skipping UniswapV3SwapLogic deployment.`);
    return false;
  }

  await deployContract(
    hre,
    UNISWAP_V3_SWAP_LOGIC_ID,
    [], // no constructor arguments
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dloopDeployer),
    undefined, // no libraries
    "UniswapV3SwapLogic",
  );

  // Return true to indicate the success of the deployment
  return true;
};

func.id = UNISWAP_V3_SWAP_LOGIC_ID;
func.tags = ["dloop", "periphery", "uniswap-v3", "swap-logic"];

export default func;
