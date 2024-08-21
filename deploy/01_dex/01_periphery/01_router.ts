import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../../utils/deploy";
import {
  SWAP_ROUTER_ID,
  UNISWAP_V3_FACTORY_ID,
} from "../../../utils/dex/deploy-ids";
import { getWETH9Address } from "../../../utils/weth9";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dexDeployer } = await hre.getNamedAccounts();

  const weth9Address = await getWETH9Address(hre);

  const { address: factoryAddress } = await hre.deployments.get(
    UNISWAP_V3_FACTORY_ID,
  );

  // The SwapRouter will be automatically found in contracts/dex/periphery/SwapRouter.sol
  await deployContract(
    hre,
    SWAP_ROUTER_ID,
    [factoryAddress, weth9Address],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "SwapRouter",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = SWAP_ROUTER_ID;
func.tags = ["dex", "periphery"];
export default func;
