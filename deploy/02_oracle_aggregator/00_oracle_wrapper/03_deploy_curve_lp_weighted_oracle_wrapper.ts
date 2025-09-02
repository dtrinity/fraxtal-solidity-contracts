import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import {
  CURVE_LP_WEIGHTED_ORACLE_WRAPPER_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  // Get the deployed OracleAggregator address
  const oracleAggregatorDeployment =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);

  await deployContract(
    hre,
    CURVE_LP_WEIGHTED_ORACLE_WRAPPER_ID,
    [
      BigInt(10) ** BigInt(config.oracleAggregator.priceDecimals),
      oracleAggregatorDeployment.address,
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dusdDeployer),
    undefined, // no library
    "CurveLPWeightedOracleWrapper",
  );

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.tags = [
  "oracle-aggregator",
  "oracle-wrapper",
  "curve-lp-weighted-oracle-wrapper",
];
func.dependencies = [ORACLE_AGGREGATOR_ID];
func.id = CURVE_LP_WEIGHTED_ORACLE_WRAPPER_ID;

export default func;
