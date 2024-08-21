import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployPoolConfigurator } from "../../../utils/lending/deploy/02_market/02_pool_configurator";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployPoolConfigurator(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
  );
};

func.id = "PoolConfigurator";
func.tags = ["lbp", "market"];

export default func;
