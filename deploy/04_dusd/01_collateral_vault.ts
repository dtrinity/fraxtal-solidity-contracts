import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../utils/deploy";
import { COLLATERAL_VAULT_CONTRACT_ID } from "../../utils/deploy-ids";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();

  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);

  await deployContract(
    hre,
    COLLATERAL_VAULT_CONTRACT_ID,
    [oracleAggregatorAddress],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dusdDeployer),
    undefined, // no libraries
    "CollateralHolderVault", // actual contract name
  );

  return true;
};

func.id = `dUSD:${COLLATERAL_VAULT_CONTRACT_ID}`;
func.tags = ["dusd"];
func.dependencies = [ORACLE_AGGREGATOR_ID];

export default func;
