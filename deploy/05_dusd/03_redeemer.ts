import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import {
  COLLATERAL_VAULT_CONTRACT_ID,
  REDEEMER_CONTRACT_ID,
} from "../../utils/deploy-ids";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();

  // Get deployed addresses
  const { address: oracleAggregatorAddress } =
    await hre.deployments.get(ORACLE_AGGREGATOR_ID);

  const { address: collateralVaultAddress } = await hre.deployments.get(
    COLLATERAL_VAULT_CONTRACT_ID,
  );
  const collateralVault = await hre.ethers.getContractAt(
    "CollateralHolderVault",
    collateralVaultAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );
  const { dusd: dusd } = await getConfig(hre);

  const deployment = await deployContract(
    hre,
    REDEEMER_CONTRACT_ID,
    [collateralVaultAddress, dusd.address, oracleAggregatorAddress],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dusdDeployer),
  );

  console.log("Allowing Redeemer to withdraw collateral");
  await collateralVault.grantRole(
    await collateralVault.COLLATERAL_WITHDRAWER_ROLE(),
    deployment.address,
  );
  return true;
};

func.id = `dUSD:${REDEEMER_CONTRACT_ID}`;
func.tags = ["dusd"];
func.dependencies = [
  COLLATERAL_VAULT_CONTRACT_ID,
  "dUSD",
  ORACLE_AGGREGATOR_ID,
];

export default func;
