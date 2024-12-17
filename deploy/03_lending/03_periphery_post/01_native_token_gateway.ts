import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployNativeTokenGateway } from "../../../utils/lending/deploy/03_periphery_post/01_native_token_gateway";
import { getWETH9Address } from "../../../utils/weth9";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const wrappedNativeTokenAddress = await getWETH9Address(hre);

  return deployNativeTokenGateway(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    wrappedNativeTokenAddress,
  );
};

func.tags = ["lbp", "lbp-periphery-post", "lbp-WrappedTokenGateway"];
func.dependencies = [];
func.id = "WrappedTokenGateway";

export default func;
