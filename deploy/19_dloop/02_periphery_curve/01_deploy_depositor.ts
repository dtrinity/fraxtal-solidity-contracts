import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { CURVE_SWAP_LOGIC_ID } from "../../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";
import { DLOOP_DEPOSITOR_CURVE_ID } from "../../../utils/vault/deploy-ids";

/**
 * Assert that the value is not empty
 *
 * @param value - The value to assert
 * @returns The input value if it is not empty
 */
function assertNotEmpty(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("Value is undefined");
  }

  if (value.trim() === "") {
    throw new Error("Trimmed value is empty");
  }

  if (value.length === 0) {
    throw new Error("Value is empty");
  }
  return value;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  if (!dloopDeployer) {
    throw new Error("DLoopDeployer is not set in the named accounts");
  }

  // Skip local networks
  if (isLocalNetwork(hre.network.name)) {
    console.log("Skipping DLoopDepositorCurve deployment on local network");
    return false;
  }

  // Get network config
  const config = await getConfig(hre);

  // Skip if no dLOOP configuration
  if (!config.dLoop) {
    console.log(
      `No dLOOP configuration defined for network ${hre.network.name}. Skipping Curve depositor deployment.`,
    );
    return false;
  }

  // Skip if no depositors section or Curve depositor is defined
  if (!config.dLoop.depositors || !config.dLoop.depositors.curve) {
    console.log(
      `Curve depositor not defined for network ${hre.network.name}. Skipping.`,
    );
    return false;
  }

  const curveConfig = config.dLoop.depositors.curve;

  if (!curveConfig.defaultSwapParamsList) {
    console.log(
      `Curve defaultSwapParamsList not defined for network ${hre.network.name}. Skipping.`,
    );
    return false;
  }

  console.log("Deploying DLoopDepositorCurve...");

  // Get the dUSD token address from the configuration
  const dUSDAddress = config.dLoop.dUSDAddress;

  if (!dUSDAddress) {
    throw new Error("dUSD token address not found in configuration");
  }

  // Get the deployed CurveSwapLogic library address
  const { address: curveSwapLogicAddress } =
    await hre.deployments.get(CURVE_SWAP_LOGIC_ID);

  // Get the Curve Router address from configuration
  const curveRouterAddress = assertNotEmpty(curveConfig.swapRouter);

  // Deploy DLoopDepositorCurve
  await deployContract(
    hre,
    DLOOP_DEPOSITOR_CURVE_ID,
    [
      dUSDAddress, // flashLenderAddress (dUSD is the flash lender)
      curveRouterAddress,
      curveConfig.defaultSwapParamsList,
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dloopDeployer),
    {
      CurveSwapLogic: curveSwapLogicAddress,
    },
    "DLoopDepositorCurve",
  );

  console.log("DLoopDepositorCurve deployed successfully");
  return true;
};

func.id = DLOOP_DEPOSITOR_CURVE_ID;
func.tags = ["dloop", "periphery", "curve", "depositor"];
func.dependencies = [CURVE_SWAP_LOGIC_ID];

export default func;
