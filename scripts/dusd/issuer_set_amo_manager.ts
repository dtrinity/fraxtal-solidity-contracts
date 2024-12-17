import hre, { ethers } from "hardhat";

import { ISSUER_CONTRACT_ID } from "../../utils/deploy-ids";

/**
 * Sets a new AMO manager in the Issuer contract.
 * This script verifies the current AMO manager, updates it if different,
 * and confirms the change was successful.
 *
 * @returns A promise that resolves when the operation is complete.
 */
async function main(): Promise<void> {
  const { dusdDeployer } = await hre.getNamedAccounts();

  // Hard-coded address for the new AMO manager (replace with actual address)
  const newAmoManager = "0x707D18189F5CbCeF41ec4695C7C61f4cad3C91e1";

  console.log("Setting new AMO manager in Issuer");
  console.log(`New AMO Manager: ${newAmoManager}`);

  // Get the deployed Issuer contract
  const issuerDeployment = await hre.deployments.get(ISSUER_CONTRACT_ID);
  const issuer = await ethers.getContractAt(
    ISSUER_CONTRACT_ID,
    issuerDeployment.address,
    await ethers.getSigner(dusdDeployer),
  );
  console.log("Issuer contract at:", issuerDeployment.address);

  // Get current AMO manager
  const currentAmoManager = await issuer.amoManager();
  console.log("Current AMO Manager:", currentAmoManager);

  if (currentAmoManager.toLowerCase() === newAmoManager.toLowerCase()) {
    console.log("AMO manager is already set to the desired address.");
    return;
  }

  // Set the new AMO manager
  console.log("Setting new AMO manager...");
  const tx = await issuer.setAmoManager(newAmoManager);
  const receipt = await tx.wait();

  console.log("New AMO manager set successfully");
  console.log(`Transaction Hash: ${receipt?.hash}`);
  console.log(`Gas Used: ${receipt?.gasUsed.toString()}`);

  // Verify the AMO manager was updated
  const updatedAmoManager = await issuer.amoManager();
  console.log(`Updated AMO Manager: ${updatedAmoManager}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
