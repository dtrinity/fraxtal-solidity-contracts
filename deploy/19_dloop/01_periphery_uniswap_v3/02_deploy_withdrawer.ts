import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import {
  SWAP_ROUTER_ID,
  UNISWAP_V3_SWAP_LOGIC_ID,
} from "../../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";
import { DLOOP_WITHDRAWER_UNISWAP_V3_ID } from "../../../utils/vault/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  if (!dloopDeployer) {
    throw new Error("DLoopDeployer is not set in the named accounts");
  }

  // Skip local networks
  if (isLocalNetwork(hre.network.name)) {
    console.log(
      "Skipping DLoopWithdrawerUniswapV3 deployment on local network",
    );
    return false;
  }

  // Get network config
  const config = await getConfig(hre);

  // Skip if no dLOOP configuration
  if (!config.dLoop) {
    console.log(
      `No dLOOP configuration defined for network ${hre.network.name}. Skipping UniswapV3 withdrawer deployment.`,
    );
    return false;
  }

  // Skip if no withdrawers section or UniswapV3 withdrawer is defined
  if (!config.dLoop.withdrawers || !config.dLoop.withdrawers.uniswapV3) {
    console.log(
      `UniswapV3 withdrawer not defined for network ${hre.network.name}. Skipping.`,
    );
    return false;
  }

  console.log("Deploying DLoopWithdrawerUniswapV3...");

  // Get the dUSD token address from the configuration
  const dUSDAddress = config.dLoop.dUSDAddress;

  if (!dUSDAddress) {
    throw new Error("dUSD token address not found in configuration");
  }

  // Get the deployed UniswapV3SwapLogic library address
  const { address: uniswapV3SwapLogicAddress } = await hre.deployments.get(
    UNISWAP_V3_SWAP_LOGIC_ID,
  );

  const { address: routerAddress } = await hre.deployments.get(SWAP_ROUTER_ID);

  if (!routerAddress) {
    throw new Error("Swap Router address not found in configuration");
  }

  // Deploy DLoopWithdrawerUniswapV3
  await deployContract(
    hre,
    DLOOP_WITHDRAWER_UNISWAP_V3_ID,
    [
      dUSDAddress, // flashLenderAddress (dUSD is the flash lender)
      routerAddress,
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dloopDeployer),
    {
      UniswapV3SwapLogic: uniswapV3SwapLogicAddress,
    },
    "DLoopWithdrawerUniswapV3",
  );

  console.log("DLoopWithdrawerUniswapV3 deployed successfully");
  return true;
};

func.id = DLOOP_WITHDRAWER_UNISWAP_V3_ID;
func.tags = ["dloop", "periphery", "uniswap-v3", "withdrawer"];
func.dependencies = [UNISWAP_V3_SWAP_LOGIC_ID];

export default func;
