import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { UNISWAP_STATIC_ORACLE_WRAPPER_ID } from "../../../utils/dex/deploy-ids";
import {
  LENDING_CORE_VERSION,
  MARKET_NAME,
} from "../../../utils/lending/constants";
import { deployOracles } from "../../../utils/lending/deploy/02_market/04_deploy_oracles";
import { getChainlinkOracles } from "../../../utils/lending/oracle";
import { getReserveTokenAddresses } from "../../../utils/lending/token";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  const { address: staticOracleWrapperAddress } = await hre.deployments.get(
    UNISWAP_STATIC_ORACLE_WRAPPER_ID,
  );

  const reserveAssetAddresses = await getReserveTokenAddresses(hre);
  const chainlinkAggregatorAddresses = await getChainlinkOracles(hre);
  const fallbackOracleAddress = staticOracleWrapperAddress;

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
func.tags = ["lbp", "market", "oracle"];
func.dependencies = ["before-deploy"];

export default func;
