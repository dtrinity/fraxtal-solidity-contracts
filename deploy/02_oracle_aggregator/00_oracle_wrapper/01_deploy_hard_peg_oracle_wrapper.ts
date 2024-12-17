import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../../config/config";
import { deployContract } from "../../../utils/deploy";
import { HARD_PEG_ORACLE_WRAPPER_ID } from "../../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();

  const config = await getConfig(hre);

  await deployContract(
    hre,
    HARD_PEG_ORACLE_WRAPPER_ID,
    [
      config.oracleAggregator.hardDusdPeg,
      BigInt(10) ** BigInt(config.oracleAggregator.priceDecimals),
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dusdDeployer),
    undefined, // no library
    "HardPegOracleWrapper",
  );

  // Return true to indicate the success of the script
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.tags = ["oracle-aggregator", "oracle-wrapper", "hard-peg-oracle-wrapper"];
func.dependencies = [];
func.id = HARD_PEG_ORACLE_WRAPPER_ID;

export default func;
