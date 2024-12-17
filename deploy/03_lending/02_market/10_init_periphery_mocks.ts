import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import {
  LENDING_PERIPHERY_VERSION,
  MARKET_NAME,
} from "../../../utils/lending/constants";
import { deployMockFlashLoanReceiver } from "../../../utils/lending/deploy/02_market/10_init_periphery_mocks";
import { isLocalNetwork, isTestnetNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (
    !isLocalNetwork(hre.network.name) &&
    !isTestnetNetwork(hre.network.name)
  ) {
    console.log(
      `Skipping ${MARKET_NAME} deploying MockFlashLoanReceiver on ${hre.network.name}`,
    );
    return false;
  }

  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployMockFlashLoanReceiver(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
  );
};

// This script can only be run successfully once per market, core version, and network
func.id = `PeripheryInit:${MARKET_NAME}:lending-periphery@${LENDING_PERIPHERY_VERSION}`;
func.tags = ["lbp", "lbp-market", "lbp-init-periphery"];
func.dependencies = [
  "before-deploy",
  "lbp-core",
  "lbp-periphery-pre",
  "lbp-provider",
  "lbp-init-pool",
  "lbp-oracles",
];

export default func;
