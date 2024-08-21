import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../../utils/deploy";
import { NFT_DESCRIPTOR_ID } from "../../../utils/dex/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dexDeployer } = await hre.getNamedAccounts();

  // The NFTDescriptor will be automatically found in contracts/dex/periphery/NFTDescriptor.sol
  await deployContract(
    hre,
    NFT_DESCRIPTOR_ID,
    [],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "NFTDescriptor",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = NFT_DESCRIPTOR_ID;
func.tags = ["dex", "periphery"];
export default func;
