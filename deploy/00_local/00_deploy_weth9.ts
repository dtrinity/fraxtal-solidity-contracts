import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../utils/deploy";
import { TEST_WETH9_ID } from "../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("This script is only for localhost network");
    return false;
  }

  const { testTokenDeployer } = await hre.getNamedAccounts();
  await deployContract(
    hre,
    TEST_WETH9_ID,
    [],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(testTokenDeployer),
    undefined, // no libraries
    "WETH9",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = TEST_WETH9_ID;
func.tags = ["mock"];
export default func;
