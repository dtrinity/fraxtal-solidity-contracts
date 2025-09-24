import hre, { ethers } from "hardhat";

import { COLLATERAL_VAULT_CONTRACT_ID } from "../../utils/deploy-ids";

/**
 * Allows a new collateral asset in the CollateralVault contract.
 * This script checks if the asset is already supported, adds it if not,
 * and then verifies the addition by listing all supported collaterals.
 *
 * @returns A promise that resolves when the operation is complete.
 */
async function main(): Promise<void> {
  const { dusdDeployer } = await hre.getNamedAccounts();

  // Hard-coded asset address for the new collateral (replace with actual address)
  const newCollateralAsset = "0x4CB47b0FD8f8EfF846889D3BEaD1c33bc93C7FD6";

  console.log("Allowing new collateral in CollateralVault");
  console.log(`New Collateral Asset: ${newCollateralAsset}`);

  // Get the deployed CollateralVault contract
  const collateralVaultDeployment = await hre.deployments.get(COLLATERAL_VAULT_CONTRACT_ID);
  const collateralVault = await ethers.getContractAt(
    COLLATERAL_VAULT_CONTRACT_ID,
    collateralVaultDeployment.address,
    await ethers.getSigner(dusdDeployer),
  );
  console.log("CollateralVault contract at:", collateralVaultDeployment.address);

  // Check if the collateral is already supported
  const isSupported = await collateralVault.isCollateralSupported(newCollateralAsset);

  if (isSupported) {
    console.log("Collateral is already supported.");
    return;
  }

  // Allow the new collateral
  console.log("Allowing new collateral...");
  const tx = await collateralVault.allowCollateral(newCollateralAsset);
  const receipt = await tx.wait();

  console.log("New collateral allowed successfully");
  console.log(`Transaction Hash: ${receipt?.hash}`);
  console.log(`Gas Used: ${receipt?.gasUsed.toString()}`);

  // Verify the collateral was added
  const isNowSupported = await collateralVault.isCollateralSupported(newCollateralAsset);
  console.log(`Collateral is now supported: ${isNowSupported}`);

  // List all supported collaterals
  const supportedCollaterals = await collateralVault.listCollateral();
  console.log("Supported Collaterals:", supportedCollaterals);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
