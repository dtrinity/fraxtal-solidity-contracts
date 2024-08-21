import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../../utils/lending/constants";
import { initReserves } from "../../../utils/lending/deploy/02_market/09_init_reserves";
import { getReserveTokenAddresses } from "../../../utils/lending/token";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const reservesAddresses = await getReserveTokenAddresses(hre);

  const config = await getConfig(hre);

  return initReserves(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    reservesAddresses,
    config.lending.rateStrategies,
    config.lending.reservesConfig,
  );
};

// This script can only be run successfully once per market, core version, and network
func.id = `ReservesInit:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "market", "init-reserves"];
func.dependencies = [
  "before-deploy",
  "core",
  "periphery-pre",
  "provider",
  "init-pool",
  "oracles",
];

export default func;
