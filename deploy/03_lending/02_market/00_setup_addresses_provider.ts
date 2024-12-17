import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../../utils/lending/constants";
import { setupAddressesProvider } from "../../../utils/lending/deploy/02_market/00_setup_addresses_provider";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const marketID = `${hre.network.name}_dtrinity_market`;

  const config = await getConfig(hre);

  return setupAddressesProvider(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    marketID,
    config.lending.providerID,
  );
};

// This script can only be run successfully once per market (the deployment on each network will be in a dedicated directpry), core version
func.id = `PoolAddressesProvider-${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "lbp-market", "lbp-provider"];
func.dependencies = [
  "before-deploy",
  "lbp-core",
  "lbp-periphery-pre",
  "token-setup",
];

export default func;
