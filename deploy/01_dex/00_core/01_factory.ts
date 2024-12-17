import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../../utils/deploy";
import { UNISWAP_V3_FACTORY_ID } from "../../../utils/dex/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dexDeployer } = await hre.getNamedAccounts();

  // The UniswapV3Factory will be automatically found in contracts/dex/core/UniswapV3Factory.sol
  await deployContract(
    hre,
    UNISWAP_V3_FACTORY_ID,
    [],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "UniswapV3Factory",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = UNISWAP_V3_FACTORY_ID;
func.tags = ["dex", "dex-core"];
export default func;
