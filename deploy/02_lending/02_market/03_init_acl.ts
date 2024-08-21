import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../../utils/lending/constants";
import { initACLManager } from "../../../utils/lending/deploy/02_market/03_init_acl";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const {
    lendingDeployer,
    lendingPoolAdmin,
    lendingAclAdmin,
    lendingEmergencyAdmin,
  } = await hre.getNamedAccounts();

  return initACLManager(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    await hre.ethers.getSigner(lendingPoolAdmin),
    await hre.ethers.getSigner(lendingAclAdmin),
    await hre.ethers.getSigner(lendingEmergencyAdmin),
  );
};

// This script can only be run successfully once per market (the deployment on each network will be in a dedicated directpry), core version
func.id = `ACLManager:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "market", "acl"];
func.dependencies = ["before-deploy", "core", "periphery-pre", "provider"];

export default func;
