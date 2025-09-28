import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { LENDING_CORE_VERSION, MARKET_NAME } from "../../utils/lending/constants";
import { initReserves } from "../../utils/lending/deploy/02_market/09_init_reserves";
import { getReserveTokenAddresses } from "../../utils/lending/token";
import { isMainnetNetwork } from "../../utils/utils";

const deployReserves = ["FXB20261231"];

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isMainnetNetwork(hre.network.name)) {
    console.log("This deployment is only for mainnet");
    return false;
  }

  const { lendingDeployer } = await hre.getNamedAccounts();

  // Get addresses for all reserves in deployReserves array
  const allReserveAddresses = await getReserveTokenAddresses(hre);
  const reservesAddresses = Object.fromEntries(deployReserves.map((symbol) => [symbol, allReserveAddresses[symbol]]));

  if (Object.keys(reservesAddresses).length === 0) {
    console.warn(`[WARNING] Skipping initialization. Empty asset list.`);
    return true;
  }

  const config = await getConfig(hre);
  const reservesConfig = Object.fromEntries(deployReserves.map((symbol) => [symbol, config.lending.reservesConfig[symbol]]));
  return initReserves(hre, await hre.ethers.getSigner(lendingDeployer), reservesAddresses, [], reservesConfig);
};

// This script can only be run successfully once per market, core version, and network
func.id = `Add${MARKET_NAME}ReservesFXB20261231:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "lbp-market", "lbp-init-reserves", "fxb-reserve", "fxb-2026"];
func.dependencies = [
  "before-deploy",
  "lbp-core",
  "lbp-periphery-pre",
  "lbp-provider",
  "lbp-init-pool",
  "lbp-oracles",
  "api3-oracle-wrapper",
  "curve-oracle-wrapper",
  "point-curve-oracle-wrapper",
  "point-api3-oracle-wrapper",
  "DeployCurveOracleWrapperFXB20261231",
  "PointCurveOracleWrapperFXB20261231",
];

export default func;
