import ProxyAdmin from "@openzeppelin/contracts/build/contracts/ProxyAdmin.json";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../../utils/deploy";
import { PROXY_ADMIN_ID } from "../../../utils/dex/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (isLocalNetwork(hre.network.name)) {
    console.log("No need to deploy proxy admin on temporary networks");
    return false;
  }

  const { dexDeployer } = await hre.getNamedAccounts();

  // Deploy the ProxyAdmin contract from ABI and bytecode
  await deployContract(
    hre,
    PROXY_ADMIN_ID,
    [],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    {
      abi: ProxyAdmin.abi,
      bytecode: ProxyAdmin.bytecode,
    },
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = PROXY_ADMIN_ID;
func.tags = ["dex", "periphery"];
export default func;
