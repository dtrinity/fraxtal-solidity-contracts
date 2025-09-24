import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { LENDING_CORE_VERSION, MARKET_NAME } from "../../../utils/lending/constants";
import { initPool } from "../../../utils/lending/deploy/02_market/06_init_pool";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const config = await getConfig(hre);

  return initPool(hre, await hre.ethers.getSigner(lendingDeployer), config.lending.flashLoanPremium);
};

// This script can only be run successfully once per market, core version, and network
func.id = `PoolInitalization:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "lbp-market", "lbp-init-pool"];
func.dependencies = ["before-deploy", "lbp-core", "lbp-periphery-pre", "lbp-provider"];

export default func;
