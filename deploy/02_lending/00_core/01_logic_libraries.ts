import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployLogicLibraries } from "../../../utils/lending/deploy/00_core/01_logic_libraries";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployLogicLibraries(hre, await hre.ethers.getSigner(lendingDeployer));
};

func.id = "LogicLibraries";
func.tags = ["lbp", "core", "logic"];

export default func;
