import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import {
  HARD_PEG_ORACLE_WRAPPER_ID,
  ORACLE_AGGREGATOR_ID,
} from "../../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  const { address: oracleAggregatorAddress } = await deployContract(
    hre,
    ORACLE_AGGREGATOR_ID,
    [BigInt(10) ** BigInt(config.oracleAggregator.priceDecimals)],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dusdDeployer),
    undefined, // no library
    "OracleAggregator",
  );

  // Get OracleAggregator contract
  const oracleAggregatorContract = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Set the oracle wrapper for dUSD
  const { address: hardPegOracleWrapperAddress } = await hre.deployments.get(
    HARD_PEG_ORACLE_WRAPPER_ID,
  );
  console.log(
    "Setting oracle wrapper for dUSD to",
    hardPegOracleWrapperAddress,
  );
  await oracleAggregatorContract.setOracle(
    config.oracleAggregator.dUSDAddress,
    hardPegOracleWrapperAddress,
  );

  // Return true to indicate the success of the script
  return true;
};

func.tags = ["oracle-aggregator"];
func.dependencies = ["oracle-wrapper"];
func.id = ORACLE_AGGREGATOR_ID;

export default func;
