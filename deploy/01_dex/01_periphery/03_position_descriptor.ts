import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../../utils/deploy";
import {
  NFT_DESCRIPTOR_ID,
  NONFUNGIBLE_TOKEN_POSITION_DESCRIPTOR_ID,
} from "../../../utils/dex/deploy-ids";
import { getWETH9Address } from "../../../utils/weth9";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dexDeployer } = await hre.getNamedAccounts();
  const nativeCurrencyLabelBytes = ethers.encodeBytes32String("WETH");

  const weth9Address = await getWETH9Address(hre);

  const nftDescriptorLibraryDeployedResult =
    await hre.deployments.get(NFT_DESCRIPTOR_ID);

  // The NonfungibleTokenPositionDescriptor will be automatically found in contracts/dex/periphery/NonfungibleTokenPositionDescriptor.sol
  await deployContract(
    hre,
    NONFUNGIBLE_TOKEN_POSITION_DESCRIPTOR_ID,
    [weth9Address, nativeCurrencyLabelBytes],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    {
      NFTDescriptor: nftDescriptorLibraryDeployedResult.address,
    },
    "NonfungibleTokenPositionDescriptor",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = NONFUNGIBLE_TOKEN_POSITION_DESCRIPTOR_ID;
func.tags = ["dex", "periphery"];
export default func;
