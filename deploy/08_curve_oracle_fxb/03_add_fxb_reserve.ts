import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../utils/lending/constants";
import { initReserves } from "../../utils/lending/deploy/02_market/09_init_reserves";
import { getReserveTokenAddresses } from "../../utils/lending/token";

const RESERVE_SYMBOL = "FXB20291231";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const reservesAddresses = {
    [RESERVE_SYMBOL]: (await getReserveTokenAddresses(hre))[RESERVE_SYMBOL],
  };

  if (
    Object.keys(reservesAddresses).length === 0 ||
    !reservesAddresses[RESERVE_SYMBOL]
  ) {
    console.warn(
      `[WARNING] Skipping initialization. Empty asset list or missing ${RESERVE_SYMBOL} reserve.`,
    );
    return true;
  }

  const config = await getConfig(hre);
  const reservesConfig = {
    [RESERVE_SYMBOL]: config.lending.reservesConfig[RESERVE_SYMBOL],
  };
  return initReserves(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    reservesAddresses,
    [],
    reservesConfig,
  );
};

// This script can only be run successfully once per market, core version, and network
func.id = `Add${RESERVE_SYMBOL}Reserve:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "lbp-market", "lbp-init-reserves", "fxb-reserve"];
func.dependencies = [
  "before-deploy",
  "lbp-core",
  "lbp-periphery-pre",
  "lbp-provider",
  "lbp-init-pool",
  "lbp-oracles",
  "curve-oracle-wrapper",
  "point-curve-oracle-wrapper",
];

export default func;
