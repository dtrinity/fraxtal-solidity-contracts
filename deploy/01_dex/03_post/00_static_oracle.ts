import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import {
  UNISWAP_STATIC_ORACLE_ID,
  UNISWAP_V3_FACTORY_ID,
} from "../../../utils/dex/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const config = await getConfig(hre);
  const cardinalityPerMinute = config.dex.oracle.cardinalityPerMinute;

  if (cardinalityPerMinute === undefined || cardinalityPerMinute < 1) {
    throw new Error("Invalid cardinality per minute");
  }

  const { dexDeployer } = await hre.getNamedAccounts();

  const { address: factoryAddress } = await hre.deployments.get(
    UNISWAP_V3_FACTORY_ID,
  );

  await deployContract(
    hre,
    UNISWAP_STATIC_ORACLE_ID,
    [factoryAddress, cardinalityPerMinute],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(dexDeployer),
    undefined, // no libraries
    "StaticOracle",
  );

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = UNISWAP_STATIC_ORACLE_ID;
func.tags = ["dex", "oracle"];
export default func;
