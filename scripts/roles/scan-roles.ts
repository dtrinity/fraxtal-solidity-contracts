import { getConfig } from "../../config/config";
import { scanRolesAndOwnership } from "./lib/scan";

async function main() {
  const hre = require("hardhat");
  const { getNamedAccounts } = hre;
  const { dusdDeployer: deployer } = await getNamedAccounts();
  const config = await getConfig(hre);
  const governance = config.walletAddresses.governanceMultisig;

  console.log(`Scanning roles/ownership on ${hre.network.name}`);

  const result = await scanRolesAndOwnership(hre, deployer, governance, (m: string) => console.log(m));

  console.log(`\nRoles contracts: ${result.rolesContracts.length}`);
  for (const c of result.rolesContracts) {
    console.log(`- ${c.name} (${c.address})`);
    if (c.rolesHeldByDeployer.length > 0) {
      console.log(`  deployer roles: ${c.rolesHeldByDeployer.map((r) => r.name).join(", ")}`);
    }
    if (c.rolesHeldByGovernance.length > 0) {
      console.log(`  governance roles: ${c.rolesHeldByGovernance.map((r) => r.name).join(", ")}`);
    }
    console.log(`  governanceHasDefaultAdmin: ${c.governanceHasDefaultAdmin}`);
  }

  console.log(`\nOwnable contracts: ${result.ownableContracts.length}`);
  for (const c of result.ownableContracts) {
    console.log(
      `- ${c.name} (${c.address}) owner=${c.owner} deployerIsOwner=${c.deployerIsOwner} governanceIsOwner=${c.governanceIsOwner}`,
    );
  }

  // Final exposure summary
  const exposureRoles = result.rolesContracts.filter((c) => c.rolesHeldByDeployer.length > 0);
  const exposureOwnable = result.ownableContracts.filter((c) => c.deployerIsOwner);
  const governanceOwnableMismatches = result.ownableContracts.filter((c) => !c.governanceIsOwner);

  console.log("\n--- Deployer Exposure Summary ---");
  if (exposureRoles.length > 0) {
    console.log(`Contracts with roles held by deployer: ${exposureRoles.length}`);
    for (const c of exposureRoles) {
      console.log(`- ${c.name} (${c.address})`);
      for (const role of c.rolesHeldByDeployer) {
        console.log(`  - ${role.name} (hash: ${role.hash})`);
      }
    }
  } else {
    console.log("Deployer holds no AccessControl roles.");
  }

  if (exposureOwnable.length > 0) {
    console.log(`\nOwnable contracts owned by deployer: ${exposureOwnable.length}`);
    for (const c of exposureOwnable) {
      console.log(`- ${c.name} (${c.address})`);
    }
  } else {
    console.log("\nDeployer owns no Ownable contracts.");
  }

  if (governanceOwnableMismatches.length > 0) {
    console.log(`\nOwnable contracts NOT owned by governance multisig: ${governanceOwnableMismatches.length}`);
    for (const c of governanceOwnableMismatches) {
      console.log(`- ${c.name} (${c.address}) owner=${c.owner}`);
    }
  } else {
    console.log("\nAll Ownable contracts are governed by the multisig.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
