import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { dUSD_REDEEMER_WITH_FEES_CONTRACT_ID } from "../../typescript/deploy-ids";

/**
 * Transfers admin roles from deployer to governance/multisig
 * This should be run after deployment and testing is complete
 *
 * @param hre - Hardhat runtime environment
 * @returns Promise<boolean> - True if role transfer was successful
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  const { dusdDeployer: deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;
  const config = await getConfig(hre);

  // Check if governance address is configured
  const governanceAddress = config.walletAddresses?.governanceMultisig;

  if (!governanceAddress) {
    console.log("⚠️  Skipping role transfer - no governance address configured");
    return true;
  }

  console.log("\n🔐 Transferring RedeemerWithFees roles to governance...");
  console.log(`Governance address: ${governanceAddress}`);

  try {
    // Transfer roles for dUSD RedeemerWithFees
    const dUSDRedeemerWithFeesDeployment = await get(dUSD_REDEEMER_WITH_FEES_CONTRACT_ID);
    const dUSDRedeemerWithFees = await hre.ethers.getContractAt(
      "RedeemerWithFees",
      dUSDRedeemerWithFeesDeployment.address,
      await hre.ethers.getSigner(deployer),
    );

    const DEFAULT_ADMIN_ROLE = await dUSDRedeemerWithFees.DEFAULT_ADMIN_ROLE();
    const REDEMPTION_MANAGER_ROLE = await dUSDRedeemerWithFees.REDEMPTION_MANAGER_ROLE();

    console.log("\n📋 dUSD RedeemerWithFees role transfer:");

    // Check current roles
    const deployerHasAdminRole = await dUSDRedeemerWithFees.hasRole(DEFAULT_ADMIN_ROLE, deployer);
    const governanceHasAdminRole = await dUSDRedeemerWithFees.hasRole(DEFAULT_ADMIN_ROLE, governanceAddress);
    const governanceHasRedemptionRole = await dUSDRedeemerWithFees.hasRole(REDEMPTION_MANAGER_ROLE, governanceAddress);

    // Grant roles to governance if needed
    if (!governanceHasAdminRole) {
      console.log("  Granting DEFAULT_ADMIN_ROLE to governance...");
      const tx1 = await dUSDRedeemerWithFees.grantRole(DEFAULT_ADMIN_ROLE, governanceAddress);
      await tx1.wait();
      console.log("  ✅ DEFAULT_ADMIN_ROLE granted");
    } else {
      console.log("  ℹ️  Governance already has DEFAULT_ADMIN_ROLE");
    }

    if (!governanceHasRedemptionRole) {
      console.log("  Granting REDEMPTION_MANAGER_ROLE to governance...");
      const tx2 = await dUSDRedeemerWithFees.grantRole(REDEMPTION_MANAGER_ROLE, governanceAddress);
      await tx2.wait();
      console.log("  ✅ REDEMPTION_MANAGER_ROLE granted");
    } else {
      console.log("  ℹ️  Governance already has REDEMPTION_MANAGER_ROLE");
    }

    // Renounce deployer's admin role if governance has it
    if (deployerHasAdminRole && governanceHasAdminRole) {
      console.log("  Renouncing deployer's DEFAULT_ADMIN_ROLE...");
      const tx3 = await dUSDRedeemerWithFees.renounceRole(DEFAULT_ADMIN_ROLE, deployer);
      await tx3.wait();
      console.log("  ✅ Deployer's DEFAULT_ADMIN_ROLE renounced");
    }

    console.log("\n✅ Role transfer completed successfully");
    console.log(`☯️  ${__filename.split("/").slice(-2).join("/")}: ✅`);
  } catch (error) {
    console.error("\n❌ Error transferring roles:", error);
    throw error;
  }

  return true;
};

func.id = "transfer_redeemer_roles_to_governance";
func.tags = ["dstable", "governance", "redeemerWithFees"];
func.dependencies = [dUSD_REDEEMER_WITH_FEES_CONTRACT_ID];

func.skip = async (hre: HardhatRuntimeEnvironment): Promise<boolean> => {
  // Only run this when explicitly requested
  return !hre.network.tags.governance;
};

export default func;
