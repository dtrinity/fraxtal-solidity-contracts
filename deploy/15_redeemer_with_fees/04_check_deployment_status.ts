import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { dUSD_REDEEMER_WITH_FEES_CONTRACT_ID } from "../../typescript/deploy-ids";
import { COLLATERAL_VAULT_CONTRACT_ID } from "../../utils/deploy-ids";

/**
 * Checks the deployment status and configuration of RedeemerWithFees contracts
 * Useful for verifying that all contracts are properly configured
 *
 * @param hre - Hardhat runtime environment
 * @returns Promise<boolean> - True if check was successful
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  const { get } = hre.deployments;
  const config = await getConfig(hre);

  console.log("\n🔍 RedeemerWithFees Deployment Status Check");
  console.log("=".repeat(50));

  try {
    // Check dUSD RedeemerWithFees
    console.log("\n📋 dUSD RedeemerWithFees:");
    const dUSDRedeemerWithFeesDeployment = await get(dUSD_REDEEMER_WITH_FEES_CONTRACT_ID);
    const dUSDRedeemerWithFees = await hre.ethers.getContractAt("RedeemerWithFees", dUSDRedeemerWithFeesDeployment.address);
    const dUSDCollateralVaultDeployment = await get(COLLATERAL_VAULT_CONTRACT_ID);

    console.log(`  Contract Address: ${dUSDRedeemerWithFeesDeployment.address}`);
    console.log(`  Fee Receiver: ${await dUSDRedeemerWithFees.feeReceiver()}`);
    console.log(`  Default Redemption Fee: ${await dUSDRedeemerWithFees.defaultRedemptionFeeBps()} bps`);
    console.log(`  Max Fee: ${await dUSDRedeemerWithFees.MAX_FEE_BPS()} bps`);
    console.log(`  Collateral Vault: ${await dUSDRedeemerWithFees.collateralVault()}`);
    console.log(`  dStable Token: ${await dUSDRedeemerWithFees.dstable()}`);

    // Check role on CollateralVault
    const dUSDCollateralVault = await hre.ethers.getContractAt("CollateralVault", dUSDCollateralVaultDeployment.address);
    const dUSDWithdrawerRole = await dUSDCollateralVault.COLLATERAL_WITHDRAWER_ROLE();
    const dUSDHasRole = await dUSDCollateralVault.hasRole(dUSDWithdrawerRole, dUSDRedeemerWithFeesDeployment.address);
    console.log(`  Has COLLATERAL_WITHDRAWER_ROLE: ${dUSDHasRole ? "✅" : "❌"}`);

    // dS RedeemerWithFees removed for Fraxtal (dS token not supported)

    // Configuration Summary
    console.log("\n📊 Configuration Summary:");
    console.log(`  dUSD Initial Fee Receiver: ${config.dStables?.dUSD?.initialFeeReceiver || "Not configured"}`);
    console.log(`  dUSD Initial Redemption Fee: ${config.dStables?.dUSD?.initialRedemptionFeeBps || "Not configured"} bps`);
    // dS configuration removed for Fraxtal (dS token not supported)

    console.log("\n✅ Deployment status check completed");
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Error checking deployment status:", error);
    throw error;
  }

  return true;
};

func.id = "check_redeemer_deployment_status";
func.tags = ["dstable", "check", "redeemerWithFees"];
func.dependencies = [
  dUSD_REDEEMER_WITH_FEES_CONTRACT_ID,
  // DS_REDEEMER_WITH_FEES_CONTRACT_ID removed for Fraxtal (dS token not supported)
];

func.skip = async (hre: HardhatRuntimeEnvironment): Promise<boolean> => {
  // Only run this when explicitly requested
  return !hre.network.tags.check;
};

export default func;
