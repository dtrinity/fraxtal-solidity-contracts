import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { CURVE_HELPER_ID } from "../../../utils/curve/deploy-ids";
import { deployContract } from "../../../utils/deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
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
