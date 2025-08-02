import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import {
  AMO_MANAGER_ID,
  COLLATERAL_VAULT_CONTRACT_ID,
} from "../../utils/deploy-ids";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();
  const { dusd: dusd } = await getConfig(hre);

  const { address: collateralVaultAddress } = await hre.deployments.get(
    COLLATERAL_VAULT_CONTRACT_ID,
  );

  const { address: oracleAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);

  await deployContract(
    hre,
    AMO_MANAGER_ID,
    [dusd.address, collateralVaultAddress, oracleAddress],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dusdDeployer),
    undefined, // no libraries
    "AmoManager", // actual contract name
  );

  return true;
};

func.id = `dUSD:${AMO_MANAGER_ID}`;
func.tags = ["dusd"];
func.dependencies = ["dUSD", COLLATERAL_VAULT_CONTRACT_ID];

export default func;
