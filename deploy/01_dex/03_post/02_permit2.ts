import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../../utils/deploy";
import { UNISWAP_PERMIT2_ID } from "../../../utils/dex/deploy-ids";
import { getPermit2Address } from "../../../utils/dex/permit2";
import { isLocalNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dexDeployer } = await hre.getNamedAccounts();

  // Only deploy the Permit2 contract on local network
  if (isLocalNetwork(hre.network.name)) {
    await deployContract(
      hre,
      UNISWAP_PERMIT2_ID,
      [],
      undefined, // auto-filling gas limit
      await hre.ethers.getSigner(dexDeployer),
      undefined, // no libraries
      "Permit2",
    );
  } else {
    const permit2Address = await getPermit2Address(hre);
    console.log(
      `Using Permit2 contract address from the configuration file: ${permit2Address}`,
    );
  }

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = UNISWAP_PERMIT2_ID;
func.tags = ["dex", "dex-ui"];
export default func;
