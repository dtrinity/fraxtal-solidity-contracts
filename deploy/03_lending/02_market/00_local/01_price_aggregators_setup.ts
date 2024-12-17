import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../../config/config";
import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../../../utils/lending/constants";
import { deployTestPriceAggregator } from "../../../../utils/lending/price-aggregator";
import { isLocalNetwork } from "../../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("This script is only for localhost/hardhat network");
    return true;
  }

  const { lendingDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  const prices = config.lending.mockPriceAggregatorInitialUSDPrices;

  if (!prices) {
    throw new Error(
      `config.lending.mockPriceAggregatorInitialUSDPrices is not defined`,
    );
  }

  await deployTestPriceAggregator(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    prices,
  );

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

// This script can only be run successfully once per market, core version, and network
func.id = `MockPriceAggregators:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "lbp-mock", "lbp-price-aggregators-setup"];
func.dependencies = ["before-deploy", "tokens-setup", "lbp-periphery-pre"];

export default func;
