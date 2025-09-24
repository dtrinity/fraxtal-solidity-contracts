import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { LENDING_CORE_VERSION, MARKET_NAME } from "../../../utils/lending/constants";
import { initOracles } from "../../../utils/lending/deploy/02_market/05_init_oracles";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return initOracles(hre, await hre.ethers.getSigner(lendingDeployer));
};

// This script can only be run successfully once per market, core version, and network
func.id = `InitOracles:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "lbp-market", "lbp-oracles"];
func.dependencies = ["before-deploy", "lbp-core", "lbp-periphery-pre", "lbp-provider"];

export default func;
