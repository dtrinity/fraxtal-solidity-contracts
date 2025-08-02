import { isAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { dUSD_REDEEMER_WITH_FEES_CONTRACT_ID } from "../../typescript/deploy-ids";
import { COLLATERAL_VAULT_CONTRACT_ID } from "../../utils/deploy-ids";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { dusdDeployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;
  const config = await getConfig(hre);
  // Collect instructions for any manual actions required when the deployer lacks permissions.
  const manualActions: string[] = [];

  // Check required configuration values (dS removed for Fraxtal)
  if (!config.dStables?.dUSD) {
    console.log(
      "⚠️  Skipping RedeemerWithFees deployment - dStables.dUSD configuration not found",
    );
    console.log(
      `☯️  ${__filename.split("/").slice(-2).join("/")}: ⏭️  (skipped)`,
    );
    return true;
  }
  const dUSDConfig = config.dStables.dUSD;

  const missingConfigs: string[] = [];

  // Check dUSD configuration
  if (
    !dUSDConfig?.initialFeeReceiver ||
    !isAddress(dUSDConfig.initialFeeReceiver)
  ) {
    missingConfigs.push("dStables.dUSD.initialFeeReceiver");
  }

  if (dUSDConfig?.initialRedemptionFeeBps === undefined) {
    missingConfigs.push("dStables.dUSD.initialRedemptionFeeBps");
  }

  // If any required config values are missing, skip deployment
  if (missingConfigs.length > 0) {
    console.log(
      `⚠️  Skipping RedeemerWithFees deployment - missing configuration values: ${missingConfigs.join(", ")}`,
    );
    console.log(
      `☯️  ${__filename.split("/").slice(-2).join("/")}: ⏭️  (skipped)`,
    );
    return true;
  }

  // Deploy RedeemerWithFees for dUSD
  const dUSDCollateralVaultDeployment = await get(COLLATERAL_VAULT_CONTRACT_ID);
  const usdOracleAggregator = await get(ORACLE_AGGREGATOR_ID);

  const dUSDRedeemerWithFeesDeployment = await deploy(
    dUSD_REDEEMER_WITH_FEES_CONTRACT_ID,
    {
      from: dusdDeployer,
      contract: "RedeemerWithFees",
      args: [
        dUSDCollateralVaultDeployment.address,
        config.dusd.address,
        usdOracleAggregator.address,
        dUSDConfig.initialFeeReceiver,
        dUSDConfig.initialRedemptionFeeBps,
      ],
    },
  );

  const dUSDCollateralVaultContract = await hre.ethers.getContractAt(
    "CollateralVault",
    dUSDCollateralVaultDeployment.address,
    await hre.ethers.getSigner(dusdDeployer),
  );
  const dUSDWithdrawerRole =
    await dUSDCollateralVaultContract.COLLATERAL_WITHDRAWER_ROLE();
  const dUSDHasRole = await dUSDCollateralVaultContract.hasRole(
    dUSDWithdrawerRole,
    dUSDRedeemerWithFeesDeployment.address,
  );
  const dUSDDeployerIsAdmin = await dUSDCollateralVaultContract.hasRole(
    await dUSDCollateralVaultContract.DEFAULT_ADMIN_ROLE(),
    dusdDeployer,
  );

  if (!dUSDHasRole) {
    if (dUSDDeployerIsAdmin) {
      console.log("Granting role for dUSD RedeemerWithFees.");
      await dUSDCollateralVaultContract.grantRole(
        dUSDWithdrawerRole,
        dUSDRedeemerWithFeesDeployment.address,
      );
      console.log("Role granted for dUSD RedeemerWithFees.");
    } else {
      manualActions.push(
        `CollateralVault (${dUSDCollateralVaultDeployment.address}).grantRole(COLLATERAL_WITHDRAWER_ROLE, ${dUSDRedeemerWithFeesDeployment.address})`,
      );
    }
  }

  // dS RedeemerWithFees deployment removed for Fraxtal

  // After processing, print any manual steps that are required.
  if (manualActions.length > 0) {
    console.log(
      "\n⚠️  Manual actions required to finalize RedeemerWithFees deployment:",
    );
    manualActions.forEach((a: string) => console.log(`   - ${a}`));
  }

  console.log(`☯️  ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = "deploy_redeemer_with_fees";
func.tags = ["dstable", "redeemerWithFees"];
func.dependencies = [COLLATERAL_VAULT_CONTRACT_ID, ORACLE_AGGREGATOR_ID]; // dS dependencies removed for Fraxtal

export default func;
