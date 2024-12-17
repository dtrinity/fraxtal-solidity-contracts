import { BigNumber } from "@ethersproject/bignumber";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { UNISWAP_STATIC_ORACLE_WRAPPER_ID } from "../../../utils/dex/deploy-ids";
import { DEX_ORACLE_WRAPPER_ID } from "../../../utils/oracle/deploy-ids";
import { isLocalNetwork } from "../../../utils/utils";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("This script is only for localhost network");
    return false;
  }

  const { dexDeployer } = await hre.getNamedAccounts();

  const { address: staticOracleWrapperAddress } = await hre.deployments.get(
    UNISWAP_STATIC_ORACLE_WRAPPER_ID,
  );

  await deployContract(
    hre,
    DEX_ORACLE_WRAPPER_ID,
    [staticOracleWrapperAddress],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no library
    "DexOracleWrapper",
  );

  // Get DexOracleWrapper contract
  const dexOracleWrapperDeployedResult = await hre.deployments.get(
    DEX_ORACLE_WRAPPER_ID,
  );
  const dexOracleWrapperContract = await hre.ethers.getContractAt(
    "DexOracleWrapper",
    dexOracleWrapperDeployedResult.address,
    await hre.ethers.getSigner(dexDeployer),
  );

  // Make sure the decimals are consistent
  const baseUnit = await dexOracleWrapperContract.BASE_CURRENCY_UNIT();
  const config = await getConfig(hre);
  const configPriceDecimals = BigNumber.from(
    config.oracleAggregator.priceDecimals,
  ).toBigInt();

  if (baseUnit !== BigInt(10) ** BigInt(configPriceDecimals)) {
    throw new Error(
      `The price decimals are not consistent: ${baseUnit} !== ${configPriceDecimals}`,
    );
  }

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.tags = ["oracle-aggregator", "oracle-wrapper", "dex-oracle-wrapper"];
func.dependencies = [];
func.id = DEX_ORACLE_WRAPPER_ID;

export default func;
