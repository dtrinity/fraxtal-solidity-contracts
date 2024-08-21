import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import {
  LENDING_PERIPHERY_VERSION,
  MARKET_NAME,
} from "../../../utils/lending/constants";
import { deployIncentives } from "../../../utils/lending/deploy/03_periphery_post/05_incentives";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployIncentives(hre, await hre.ethers.getSigner(lendingDeployer));
};

func.id = `Incentives:${MARKET_NAME}:lending-periphery@${LENDING_PERIPHERY_VERSION}`;
func.tags = ["lbp", "market", "IncentivesProxy"];
func.dependencies = ["before-deploy", "core", "periphery-pre", "provider"];

export default func;
