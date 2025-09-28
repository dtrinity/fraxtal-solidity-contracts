import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { LENDING_CORE_VERSION, MARKET_NAME } from "../../../utils/lending/constants";
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
// Bump the ID so the script re-runs once to pick up new reserves (e.g. dUSD)
func.id = `ReservesInit:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}:v2`;
func.tags = ["lbp", "lbp-market", "lbp-init-reserves"];
func.dependencies = [
  "before-deploy",
  "lbp-core",
  "lbp-periphery-pre",
  "lbp-provider",
  "lbp-init-pool",
  "lbp-oracles",
  "dStable", // Ensure dUSD token is deployed before initializing reserves
];

export default func;
