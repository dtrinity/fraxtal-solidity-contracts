import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { ZERO_BYTES_32 } from "../../utils/lending/constants";
import { isMainnetNetwork } from "../../utils/utils";

/**
 * Transfer all dSTAKE roles from deployer to the governance multisig / configured
 * addresses. Split into its own script so deployer retains permissions during
 * earlier configuration steps.
 *
 * @param hre - Hardhat runtime environment
 * @returns Promise that resolves when role migration is complete
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isMainnetNetwork(hre.network.name)) {
    console.log(`\n🔑 ${__filename.split("/").slice(-2).join("/")}: Skipping non-mainnet network`);
    return true;
  }

  const { getNamedAccounts, ethers } = hre;
  const { dusdDeployer: deployer } = await getNamedAccounts();

  if (!deployer) {
    throw new Error("Named account 'dusdDeployer' is not configured for this network");
  }
  const deployerSigner: Signer = await ethers.getSigner(deployer);

  const config = await getConfig(hre);

  if (!config.dStake) {
    console.log("No dSTAKE instances configured – skipping role migration");
    return true;
  }

  for (const instanceKey of Object.keys(config.dStake)) {
    const instanceConfig = config.dStake[instanceKey]!;
    console.log(`\n🔄 Migrating roles for dSTAKE instance ${instanceKey}…`);

    const tokenId = `DStakeToken_${instanceKey}`;
    const vaultId = `DStakeCollateralVault_${instanceKey}`;
    const routerId = `DStakeRouter_${instanceKey}`;

    // --- Token ---
    await migrateRoles(
      hre,
      tokenId,
      "DStakeToken",
      [
        {
          roleName: "FEE_MANAGER_ROLE",
          roleHash: await getRoleHash(hre, "DStakeToken", tokenId, "FEE_MANAGER_ROLE"),
          target: instanceConfig.initialFeeManager,
        },
        {
          roleName: "DEFAULT_ADMIN_ROLE",
          roleHash: ZERO_BYTES_32,
          target: instanceConfig.initialAdmin,
        },
      ],
      deployer,
      deployerSigner,
    );

    // --- Vault ---
    await migrateRoles(
      hre,
      vaultId,
      "DStakeCollateralVault",
      [
        {
          roleName: "DEFAULT_ADMIN_ROLE",
          roleHash: ZERO_BYTES_32,
          target: instanceConfig.initialAdmin,
        },
      ],
      deployer,
      deployerSigner,
    );

    // --- Router ---
    await migrateRoles(
      hre,
      routerId,
      "DStakeRouterDLend",
      [
        {
          roleName: "DEFAULT_ADMIN_ROLE",
          roleHash: ZERO_BYTES_32,
          target: instanceConfig.initialAdmin,
        },
      ],
      deployer,
      deployerSigner,
    );

    console.log(`  ✅ Completed ${instanceKey}`);
  }

  console.log(`\n🔑 ${__filename.split("/").slice(-2).join("/")}: ✅ Done\n`);
  return true;
};

interface RoleMigration {
  roleName: string;
  roleHash: string;
  target: string;
}

/**
 * Migrate roles for a specific dSTAKE contract from deployer to target addresses.
 *
 * @param hre - Hardhat runtime environment
 * @param deploymentId - Deployment ID to look up
 * @param contractName - Contract name for typechain
 * @param roles - Array of role migrations to perform
 * @param deployer - Deployer address to revoke roles from
 * @param signer - Signer to use for transactions
 * @returns Promise that resolves when migration is complete
 */
async function migrateRoles(
  hre: HardhatRuntimeEnvironment,
  deploymentId: string,
  contractName: string,
  roles: RoleMigration[],
  deployer: string,
  signer: Signer,
): Promise<void> {
  const { deployments, ethers } = hre;
  const dep = await deployments.getOrNull(deploymentId);

  if (!dep) {
    console.log(`  ⚠️ ${deploymentId} not deployed, skipping`);
    return;
  }

  const contract = await ethers.getContractAt(contractName, dep.address, signer);

  const signerAddress = await signer.getAddress();

  for (const role of roles) {
    // Check if signer has admin role required to manage this role
    const adminRoleHash = await contract.getRoleAdmin(role.roleHash);
    const signerIsAdmin = await contract.hasRole(adminRoleHash, signerAddress);

    if (!signerIsAdmin) {
      console.log(
        `    ⚠️  Signer lacks admin rights for ${role.roleName}. Manual action required:` +
          ` grantRole(${role.roleName}, ${role.target}) and/or revokeRole(${role.roleName}, ${deployer})`,
      );
      continue; // avoid revert – skip to next role
    }

    // Grant to target if not yet granted
    if (!(await contract.hasRole(role.roleHash, role.target))) {
      await contract.grantRole(role.roleHash, role.target);
      console.log(`    ➕ Granted ${role.roleName} to ${role.target}`);
    }

    // Revoke from deployer if still present
    if (await contract.hasRole(role.roleHash, deployer)) {
      await contract.revokeRole(role.roleHash, deployer);
      console.log(`    ➖ Revoked ${role.roleName} from deployer`);
    }
  }
}

/**
 * Get the hash value for a role constant from a deployed contract.
 *
 * @param hre - Hardhat runtime environment
 * @param contractName - Contract name for typechain
 * @param deploymentId - Deployment ID to look up
 * @param roleConstantName - Name of the role constant to retrieve
 * @returns Promise that resolves to the role hash
 */
async function getRoleHash(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  deploymentId: string,
  roleConstantName: string,
): Promise<string> {
  const { deployments, ethers } = hre;
  const dep = await deployments.get(deploymentId);
  const contract = await ethers.getContractAt(contractName, dep.address);
  return await contract[roleConstantName]();
}

func.tags = ["dStakeRoleTransfer", "postDStake"];
func.dependencies = ["dStakeConfiguration"];
func.runAtTheEnd = true;
func.id = "transfer_dstake_roles_to_multisig";

export default func;
