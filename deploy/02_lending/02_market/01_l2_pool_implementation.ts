import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployL2PoolImplementation } from "../../../utils/lending/deploy/02_market/01_l2_pool_implementation";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployL2PoolImplementation(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
  );
};

func.id = "L2PoolImplementations";
func.tags = ["lbp", "market"];

export default func;
