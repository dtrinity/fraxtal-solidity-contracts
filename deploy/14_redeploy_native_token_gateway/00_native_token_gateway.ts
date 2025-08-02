import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployNativeTokenGateway } from "../../utils/lending/deploy/03_periphery_post/01_native_token_gateway";
import { getWETH9Address } from "../../utils/weth9";

// Redeploy the Native Token Gateway after Fraxtal hardfork
// https://snapshot.box/#/s:frax.eth/proposal/0xc81e2268834ec1243e08c5d616c98c8e91e2304f7b38ee1d932f450efb18eb8a
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const wrappedNativeTokenAddress = await getWETH9Address(hre);

  return deployNativeTokenGateway(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    wrappedNativeTokenAddress,
  );
};

func.tags = [
  "lbp",
  "lbp-periphery-post",
  "lbp-WrappedTokenGateway",
  "fraxtal-hardfork",
];
func.dependencies = [];
func.id = "NewWrappedTokenGateway";

export default func;
