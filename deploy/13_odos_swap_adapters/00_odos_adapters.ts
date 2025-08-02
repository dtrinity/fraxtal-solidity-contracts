import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import {
  LENDING_PERIPHERY_VERSION,
  MARKET_NAME,
} from "../../utils/lending/constants";
import { deployOdosAdapters } from "../../utils/lending/deploy/03_periphery_post/07_odos_adapters";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployOdosAdapters(hre, await hre.ethers.getSigner(lendingDeployer));
};

func.tags = ["lbp", "lbp-periphery-post", "lbp-odos-adapters"];
// This script can only be run successfully once per market, core version, and network
func.id = `OdosAdapters:${MARKET_NAME}:lending-periphery@${LENDING_PERIPHERY_VERSION}`;

export default func;
