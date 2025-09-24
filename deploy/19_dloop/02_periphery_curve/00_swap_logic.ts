import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { CURVE_HELPER_ID } from "../../../utils/curve/deploy-ids";
import { deployContract } from "../../../utils/deploy";
import { CURVE_SWAP_LOGIC_ID } from "../../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dloopDeployer } = await hre.getNamedAccounts();

  if (!dloopDeployer) {
    throw new Error("DLoopDeployer is not set in the named accounts");
  }

  // Skip local networks
  if (isLocalNetwork(hre.network.name)) {
    console.log("Skipping CurveSwapLogic deployment on local network");
    return false;
  }

  // Skip if dLOOP Curve is not configured for this network
  const config = await getConfig(hre);
  const hasCurveConfig =
    config.dLoop &&
    ((config.dLoop.depositors && config.dLoop.depositors.curve) || (config.dLoop.withdrawers && config.dLoop.withdrawers.curve));

  if (!hasCurveConfig) {
    console.log(`No dLOOP Curve depositor/withdrawer defined for network ${hre.network.name}. Skipping CurveSwapLogic deployment.`);
    return false;
  }

  // Check if CurveHelper is already deployed
  let curveHelperDeployment = await hre.deployments.getOrNull(CURVE_HELPER_ID);

  // Deploy CurveHelper if not already deployed
  if (!curveHelperDeployment) {
    console.log("CurveHelper is not deployed, deploying it...");
    await deployContract(
      hre,
      CURVE_HELPER_ID,
      [], // no constructor arguments
      undefined, // auto-filling gas limit
      await hre.ethers.getSigner(dloopDeployer),
      undefined, // no libraries
      "CurveHelper",
    );
  }

  // Get the deployed CurveHelper address
  curveHelperDeployment = await hre.deployments.get(CURVE_HELPER_ID);

  if (!curveHelperDeployment.address) {
    throw new Error("CurveHelper is not deployed");
  }

  // Deploy CurveSwapLogic with CurveHelper as a library
  await deployContract(
    hre,
    CURVE_SWAP_LOGIC_ID,
    [], // no constructor arguments
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dloopDeployer),
    {
      CurveHelper: curveHelperDeployment.address,
    },
    "CurveSwapLogic",
  );

  // Return true to indicate the success of the deployment
  return true;
};

func.id = CURVE_SWAP_LOGIC_ID;
func.tags = ["dloop", "periphery", "curve", "swap-logic"];
func.dependencies = [CURVE_HELPER_ID];

export default func;
