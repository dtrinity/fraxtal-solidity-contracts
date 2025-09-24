import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { LENDING_PERIPHERY_VERSION, MARKET_NAME } from "../../../utils/lending/constants";
import { deployCurveAdapters } from "../../../utils/lending/deploy/03_periphery_post/06_curve_adaptes";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployCurveAdapters(hre, await hre.ethers.getSigner(lendingDeployer));
};

func.tags = ["lbp", "lbp-periphery-post", "lbp-curve-adapters"];
// This script can only be run successfully once per market, core version, and network
func.id = `CurveAdapters:${MARKET_NAME}:lending-periphery@${LENDING_PERIPHERY_VERSION}`;

export default func;
