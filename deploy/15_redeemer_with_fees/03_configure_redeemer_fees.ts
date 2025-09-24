import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { dUSD_REDEEMER_WITH_FEES_CONTRACT_ID } from "../../typescript/deploy-ids";

/**
 * Post-deployment configuration script for RedeemerWithFees contracts
 * This script configures collateral-specific redemption fees if needed
 *
 * @param hre - Hardhat runtime environment
 * @returns Promise<boolean> - True if configuration was successful
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment): Promise<boolean> {
  const { dusdDeployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;
  const config = await getConfig(hre);

  console.log("Starting RedeemerWithFees fee configuration...");

  // Get deployed contracts
  const dUSDRedeemerWithFeesDeployment = await get(dUSD_REDEEMER_WITH_FEES_CONTRACT_ID);
  // dS RedeemerWithFees removed for Fraxtal (dS token not supported)

  // Configure dUSD RedeemerWithFees
  if (config.dStables?.dUSD?.collateralRedemptionFees) {
    const dUSDRedeemerWithFees = await hre.ethers.getContractAt(
      "RedeemerWithFees",
      dUSDRedeemerWithFeesDeployment.address,
      await hre.ethers.getSigner(dusdDeployer),
    );

    console.log("Configuring collateral-specific fees for dUSD...");

    for (const [collateral, feeBps] of Object.entries(config.dStables!.dUSD!.collateralRedemptionFees)) {
      try {
        const currentFee = await dUSDRedeemerWithFees.collateralRedemptionFeeBps(collateral);

        if (currentFee.toString() !== feeBps.toString()) {
          console.log(`Setting fee for collateral ${collateral} to ${feeBps} bps...`);
          const tx = await dUSDRedeemerWithFees.setCollateralRedemptionFee(collateral, feeBps);
          await tx.wait();
          console.log(`✅ Fee set for ${collateral}`);
        } else {
          console.log(`ℹ️  Fee for ${collateral} already set to ${feeBps} bps`);
        }
      } catch (error) {
        console.error(`❌ Failed to set fee for collateral ${collateral}:`, error);
      }
    }
  }

  // dS RedeemerWithFees configuration removed for Fraxtal (dS token not supported)

  console.log(`☯️  ${__filename.split("/").slice(-2).join("/")}: ✅`);

  return true;
};

func.id = "configure_redeemer_fees";
func.tags = ["dstable", "configure", "redeemerWithFees"];
func.dependencies = [
  dUSD_REDEEMER_WITH_FEES_CONTRACT_ID,
  // DS_REDEEMER_WITH_FEES_CONTRACT_ID removed for Fraxtal (dS token not supported)
];
func.runAtTheEnd = true;

export default func;
