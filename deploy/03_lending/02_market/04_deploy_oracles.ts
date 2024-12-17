import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../../utils/lending/constants";
import { deployOracles } from "../../../utils/lending/deploy/02_market/04_deploy_oracles";
import { getChainlinkOracles } from "../../../utils/lending/oracle";
import { getReserveTokenAddresses } from "../../../utils/lending/token";
import { ORACLE_AGGREGATOR_ID } from "../../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);

  const reserveAssetAddresses = await getReserveTokenAddresses(hre);
  const chainlinkAggregatorAddresses = await getChainlinkOracles(hre);
  const fallbackOracleAddress = oracleAggregatorAddress;

  const config = await getConfig(hre);
  const baseCurencyDecimals = config.dex.oracle.baseTokenDecimals;

  return deployOracles(
    hre,
    await hre.ethers.getSigner(lendingDeployer),
    reserveAssetAddresses,
    chainlinkAggregatorAddresses,
    fallbackOracleAddress,
    baseCurencyDecimals,
  );
};

func.id = `Oracles:${MARKET_NAME}:lending-core@${LENDING_CORE_VERSION}`;
func.tags = ["lbp", "lbp-market", "lbp-oracle"];
func.dependencies = ["before-deploy"];

export default func;
