import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { deployContract } from "../../utils/deploy";
import { COLLATERAL_VAULT_CONTRACT_ID, ISSUER_V2_2_CONTRACT_ID } from "../../utils/deploy-ids";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();

  const existingIssuer = await hre.deployments.getOrNull(ISSUER_V2_2_CONTRACT_ID);
  if (existingIssuer) {
    console.log(`IssuerV2 already deployed at ${existingIssuer.address}, skipping...`);
    return;
  }

  // Resolve dependencies
  const { address: oracleAggregatorAddress } = await hre.deployments.get(ORACLE_AGGREGATOR_ID);
  const { address: collateralVaultAddress } = await hre.deployments.get(COLLATERAL_VAULT_CONTRACT_ID);
  const {
    dusd: { address: dusdAddress },
  } = await getConfig(hre);

  await deployContract(
    hre,
    ISSUER_V2_2_CONTRACT_ID,
    [collateralVaultAddress, dusdAddress, oracleAggregatorAddress],
    undefined, // auto gas
    await hre.ethers.getSigner(dusdDeployer),
    undefined,
    "IssuerV2_2",
  );

  return true;
};

func.id = `dUSD:${ISSUER_V2_2_CONTRACT_ID}`;
func.tags = ["dusd-upgrade", ISSUER_V2_2_CONTRACT_ID];
func.dependencies = [COLLATERAL_VAULT_CONTRACT_ID, "dUSD", ORACLE_AGGREGATOR_ID];

export default func;
