import fs from "fs";
import hre from "hardhat";

/**
 * Remove a deployment from the migration file to allow re-deployment
 */
async function main(): Promise<void> {
  // DLoopVaultCurve DLoopVault-FXS-3000000
  const deploymentID = "DLoopVaultCurve";
  const deploymentName = "DLoopVault-FXS-3000000";

  if (!deploymentName) {
    throw new Error("Deployment name is required as the first argument");
  }

  const migrationPath = `deployments/${hre.network.name}/.migrations.json`;

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file does not exist: ${migrationPath}`);
  }

  console.log(`Removing deployment migration for ${deploymentID}`);

  // Load the migration file
  const data = fs.readFileSync(migrationPath, "utf8");
  const migrations = JSON.parse(data);

  if (migrations[deploymentID]) {
    console.log(`Removing migration ID for ${deploymentID}`);
    delete migrations[deploymentID];
  } else {
    console.log(`Migration ID for ${deploymentID} does not exist, skipping`);
  }

  // Write the migration file
  fs.writeFileSync(migrationPath, JSON.stringify(migrations, null, 2));

  // Delete the deployment file
  const deploymentPath = `deployments/${hre.network.name}/${deploymentName}.json`;

  if (fs.existsSync(deploymentPath)) {
    console.log(`Removing deployment file for ${deploymentName}`);
    fs.unlinkSync(deploymentPath);
  } else {
    console.log(
      `Deployment file for ${deploymentName} does not exist, skipping`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
