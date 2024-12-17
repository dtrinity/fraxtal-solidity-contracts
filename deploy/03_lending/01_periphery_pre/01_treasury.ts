import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployTreasury } from "../../../utils/lending/deploy/01_periphery_pre/01_treasury";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer, lendingTreasuryOwner } =
    await hre.getNamedAccounts();

  return deployTreasury(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    await hre.ethers.getSigner(lendingTreasuryOwner),
  );
};

func.tags = ["lbp", "lbp-periphery-pre", "lbp-TreasuryProxy"];
func.dependencies = [];
func.id = "Treasury";

export default func;
