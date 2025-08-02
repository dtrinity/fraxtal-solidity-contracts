import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { CURVE_HELPER_ID } from "../../../utils/curve/deploy-ids";
import { deployContract } from "../../../utils/deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = await getConfig(hre);

  // Skip deployment if dex config is not populated
  if (!config.dex) {
    console.log("Skipping Curve Helper deployment - dex config not populated");
    return false;
  }

  const { curveHelperDeployer } = await hre.getNamedAccounts();

  if (!curveHelperDeployer) {
    throw new Error("CurveHelperDeployer is not set in the named accounts");
  }

  await deployContract(
    hre,
    CURVE_HELPER_ID,
    [], // no constructor arguments
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(curveHelperDeployer),
    undefined, // no libraries
    "CurveHelper",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = CURVE_HELPER_ID;
func.tags = ["dex", "dex-core", "curve-helper"];

export default func;
