import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import {
  AMO_MANAGER_ID,
  COLLATERAL_VAULT_CONTRACT_ID,
  ISSUER_CONTRACT_ID,
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
  const { dusd: dusd } = await getConfig(hre);
  const { address: amoManagerAddress } =
    await hre.deployments.get(AMO_MANAGER_ID);

  await deployContract(
    hre,
    ISSUER_CONTRACT_ID,
    [
      collateralVaultAddress,
      dusd.address,
      oracleAggregatorAddress,
      amoManagerAddress,
    ],
    undefined, // auto-filled gas limit
    await hre.ethers.getSigner(dusdDeployer),
  );

  return true;
};

func.id = `dUSD:${ISSUER_CONTRACT_ID}`;
func.tags = ["dusd"];
func.dependencies = [
  COLLATERAL_VAULT_CONTRACT_ID,
  "dUSD",
  ORACLE_AGGREGATOR_ID,
  AMO_MANAGER_ID,
];

export default func;
