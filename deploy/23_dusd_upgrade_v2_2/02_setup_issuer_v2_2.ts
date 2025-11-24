import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import {
  AMO_DEBT_TOKEN_ID,
  AMO_MANAGER_V2_ID,
  COLLATERAL_VAULT_CONTRACT_ID,
  ISSUER_V2_2_CONTRACT_ID,
  ISSUER_V2_CONTRACT_ID,
} from "../../utils/deploy-ids";
import { ensureDefaultAdminExistsAndRevokeFrom } from "../../utils/hardhat/access_control";

const ZERO_BYTES_32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Build Safe transaction data for AccessControl.grantRole.
 *
 * @param contractAddress Contract address to call
 * @param role Role identifier (bytes32) to grant
 * @param grantee Address that should receive the role
 * @param contractInterface Interface used to encode the function call
 * @returns Safe transaction payload for grantRole
 */
function createGrantRoleTransaction(contractAddress: string, role: string, grantee: string, contractInterface: any): SafeTransactionData {
  return {
    to: contractAddress,
    value: "0",
    data: contractInterface.encodeFunctionData("grantRole", [role, grantee]),
  };
}

/**
 * Build Safe transaction data for AccessControl.revokeRole.
 *
 * @param contractAddress Contract address to call
 * @param role Role identifier (bytes32) to revoke
 * @param account Account from which the role will be revoked
 * @param contractInterface Interface used to encode the function call
 * @returns Safe transaction payload for revokeRole
 */
function createRevokeRoleTransaction(contractAddress: string, role: string, account: string, contractInterface: any): SafeTransactionData {
  return {
    to: contractAddress,
    value: "0",
    data: contractInterface.encodeFunctionData("revokeRole", [role, account]),
  };
}

/**
 * Ensure the given `grantee` holds MINTER_ROLE on the specified dUSD token.
 * Grants if missing, or queues a Safe transaction if in Safe mode.
 *
 * @param hre Hardhat runtime environment
 * @param stableAddress Address of the dUSD token (AccessControl-enabled)
 * @param grantee Address that should be granted MINTER_ROLE
 * @param executor Governance executor helper for direct/queued execution
 * @returns True if complete, false if pending governance
 */
async function ensureMinterRole(
  hre: HardhatRuntimeEnvironment,
  stableAddress: string,
  grantee: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const stable = await hre.ethers.getContractAt("ERC20StablecoinUpgradeable", stableAddress);
  const MINTER_ROLE = await stable.MINTER_ROLE();

  if (!(await stable.hasRole(MINTER_ROLE, grantee))) {
    const complete = await executor.tryOrQueue(
      async () => {
        await stable.grantRole(MINTER_ROLE, grantee);
        console.log(`    ➕ Granted MINTER_ROLE to ${grantee}`);
      },
      () => createGrantRoleTransaction(stableAddress, MINTER_ROLE, grantee, stable.interface),
    );
    return complete;
  }

  console.log(`    ✓ MINTER_ROLE already granted to ${grantee}`);
  return true;
}

/**
 * Migrate IssuerV2_2 roles to governance in a safe, idempotent sequence.
 * Grants roles to governance first, then revokes them from the deployer.
 *
 * @param hre Hardhat runtime environment
 * @param issuerAddress Address of the IssuerV2_2 contract
 * @param deployerSigner Deployer signer currently holding roles
 * @param governanceMultisig Governance multisig address to receive roles
 * @param executor Governance executor helper for direct/queued execution
 * @returns True if complete, false if pending governance
 */
async function migrateIssuerRolesIdempotent(
  hre: HardhatRuntimeEnvironment,
  issuerAddress: string,
  deployerSigner: Signer,
  governanceMultisig: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const issuer = await hre.ethers.getContractAt("IssuerV2_2", issuerAddress, deployerSigner);

  const DEFAULT_ADMIN_ROLE = ZERO_BYTES_32;
  const INCENTIVES_MANAGER_ROLE = await issuer.INCENTIVES_MANAGER_ROLE();
  const PAUSER_ROLE = await issuer.PAUSER_ROLE();

  const roles = [
    { name: "DEFAULT_ADMIN_ROLE", hash: DEFAULT_ADMIN_ROLE },
    { name: "INCENTIVES_MANAGER_ROLE", hash: INCENTIVES_MANAGER_ROLE },
    { name: "PAUSER_ROLE", hash: PAUSER_ROLE },
  ];

  console.log(`  📄 Migrating roles for IssuerV2_2 at ${issuerAddress}`);

  let allComplete = true;

  for (const role of roles) {
    if (!(await issuer.hasRole(role.hash, governanceMultisig))) {
      const complete = await executor.tryOrQueue(
        async () => {
          await issuer.grantRole(role.hash, governanceMultisig);
          console.log(`    ➕ Granted ${role.name} to ${governanceMultisig}`);
        },
        () => createGrantRoleTransaction(issuerAddress, role.hash, governanceMultisig, issuer.interface),
      );
      if (!complete) allComplete = false;
    } else {
      console.log(`    ✓ ${role.name} already granted to ${governanceMultisig}`);
    }
  }

  const deployerAddress = await deployerSigner.getAddress();

  for (const role of [INCENTIVES_MANAGER_ROLE, PAUSER_ROLE]) {
    if (await issuer.hasRole(role, deployerAddress)) {
      const complete = await executor.tryOrQueue(
        async () => {
          await issuer.revokeRole(role, deployerAddress);
          console.log(`    ➖ Revoked ${role} from deployer`);
        },
        () => createRevokeRoleTransaction(issuerAddress, role, deployerAddress, issuer.interface),
      );
      if (!complete) allComplete = false;
    }
  }

  try {
    await ensureDefaultAdminExistsAndRevokeFrom(
      hre,
      "IssuerV2_2",
      issuerAddress,
      governanceMultisig,
      deployerAddress,
      deployerSigner,
      undefined,
      executor,
    );
  } catch {
    allComplete = false;
  }

  return allComplete;
}

/**
 * Grant COLLATERAL_WITHDRAWER_ROLE on the vault to a target grantee.
 *
 * @param hre Hardhat runtime environment
 * @param vaultAddress Address of the collateral vault
 * @param grantee Address that should receive the withdrawer role
 * @param executor Governance executor helper for direct/queued execution
 * @returns True if complete, false if pending governance
 */
async function ensureVaultWithdrawerRole(
  hre: HardhatRuntimeEnvironment,
  vaultAddress: string,
  grantee: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const vault = await hre.ethers.getContractAt("CollateralHolderVault", vaultAddress);
  const WITHDRAWER_ROLE = await vault.COLLATERAL_WITHDRAWER_ROLE();
  let complete = true;

  if (!(await vault.hasRole(WITHDRAWER_ROLE, grantee))) {
    complete = await executor.tryOrQueue(
      async () => {
        await vault.grantRole(WITHDRAWER_ROLE, grantee);
        console.log(`    ➕ Granted COLLATERAL_WITHDRAWER_ROLE to ${grantee}`);
      },
      () => createGrantRoleTransaction(vaultAddress, WITHDRAWER_ROLE, grantee, vault.interface),
    );
  } else {
    console.log(`    ✓ COLLATERAL_WITHDRAWER_ROLE already granted to ${grantee}`);
  }

  return complete;
}

/**
 * Ensure the debt token is configured as supported collateral in the vault.
 *
 * @param hre Hardhat runtime environment
 * @param vaultAddress Address of the collateral vault
 * @param debtTokenAddress Address of the AMO debt token
 * @param executor Governance executor helper for direct/queued execution
 * @returns True if complete, false if pending governance
 */
async function ensureDebtTokenCollateral(
  hre: HardhatRuntimeEnvironment,
  vaultAddress: string,
  debtTokenAddress: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const vault = await hre.ethers.getContractAt("CollateralHolderVault", vaultAddress);

  if (await vault.isCollateralSupported(debtTokenAddress)) {
    console.log(`    ✓ Debt token already supported as collateral in vault`);
    return true;
  }

  const complete = await executor.tryOrQueue(
    async () => {
      await vault.allowCollateral(debtTokenAddress);
      console.log(`    ➕ Enabled debt token ${debtTokenAddress} as vault collateral`);
    },
    () => ({
      to: vaultAddress,
      value: "0",
      data: vault.interface.encodeFunctionData("allowCollateral", [debtTokenAddress]),
    }),
  );

  return complete;
}

/**
 * Migrate AmoManagerV2 administrative and operator roles to governance.
 * Grants roles to governance first, then revokes them from the deployer.
 *
 * @param hre Hardhat runtime environment
 * @param managerAddress Address of the AmoManagerV2 contract
 * @param deployerSigner Deployer signer currently holding roles
 * @param governanceMultisig Governance multisig address to receive roles
 * @param executor Governance executor helper for direct/queued execution
 * @returns True if complete, false if pending governance
 */
async function migrateAmoManagerRoles(
  hre: HardhatRuntimeEnvironment,
  managerAddress: string,
  deployerSigner: Signer,
  governanceMultisig: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const manager = await hre.ethers.getContractAt("AmoManagerV2", managerAddress, deployerSigner);
  const DEFAULT_ADMIN_ROLE = ZERO_BYTES_32;
  const AMO_INCREASE_ROLE = await manager.AMO_INCREASE_ROLE();
  const AMO_DECREASE_ROLE = await manager.AMO_DECREASE_ROLE();

  const deployerAddress = await deployerSigner.getAddress();
  let allComplete = true;

  for (const role of [
    { name: "DEFAULT_ADMIN_ROLE", hash: DEFAULT_ADMIN_ROLE },
    { name: "AMO_INCREASE_ROLE", hash: AMO_INCREASE_ROLE },
    { name: "AMO_DECREASE_ROLE", hash: AMO_DECREASE_ROLE },
  ]) {
    if (!(await manager.hasRole(role.hash, governanceMultisig))) {
      const complete = await executor.tryOrQueue(
        async () => {
          await manager.grantRole(role.hash, governanceMultisig);
          console.log(`    ➕ Granted ${role.name} to ${governanceMultisig}`);
        },
        () => createGrantRoleTransaction(managerAddress, role.hash, governanceMultisig, manager.interface),
      );
      if (!complete) allComplete = false;
    } else {
      console.log(`    ✓ ${role.name} already granted to ${governanceMultisig}`);
    }
  }

  for (const role of [AMO_INCREASE_ROLE, AMO_DECREASE_ROLE]) {
    if (await manager.hasRole(role, deployerAddress)) {
      const complete = await executor.tryOrQueue(
        async () => {
          await manager.revokeRole(role, deployerAddress);
          console.log(`    ➖ Revoked ${role} from deployer`);
        },
        () => createRevokeRoleTransaction(managerAddress, role, deployerAddress, manager.interface),
      );
      if (!complete) allComplete = false;
    }
  }

  try {
    await ensureDefaultAdminExistsAndRevokeFrom(
      hre,
      "AmoManagerV2",
      managerAddress,
      governanceMultisig,
      deployerAddress,
      deployerSigner,
      undefined,
      executor,
    );
  } catch {
    allComplete = false;
  }

  return allComplete;
}

/**
 * Migrate AmoDebtToken admin role to governance while keeping the flow Safe-friendly.
 *
 * @param hre Hardhat runtime environment
 * @param debtTokenAddress Address of the AmoDebtToken contract
 * @param deployerSigner Deployer signer currently holding the admin role
 * @param governanceMultisig Governance multisig address to receive the admin role
 * @param executor Governance executor helper for direct/queued execution
 * @returns True if complete, false if pending governance
 */
async function migrateAmoDebtTokenAdmin(
  hre: HardhatRuntimeEnvironment,
  debtTokenAddress: string,
  deployerSigner: Signer,
  governanceMultisig: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const debtToken = await hre.ethers.getContractAt("AmoDebtToken", debtTokenAddress, deployerSigner);
  const DEFAULT_ADMIN_ROLE = ZERO_BYTES_32;
  const deployerAddress = await deployerSigner.getAddress();

  let allComplete = true;

  if (!(await debtToken.hasRole(DEFAULT_ADMIN_ROLE, governanceMultisig))) {
    const complete = await executor.tryOrQueue(
      async () => {
        await debtToken.grantRole(DEFAULT_ADMIN_ROLE, governanceMultisig);
        console.log(`    ➕ Granted DEFAULT_ADMIN_ROLE on debt token to ${governanceMultisig}`);
      },
      () => createGrantRoleTransaction(debtTokenAddress, DEFAULT_ADMIN_ROLE, governanceMultisig, debtToken.interface),
    );
    if (!complete) allComplete = false;
  } else {
    console.log(`    ✓ DEFAULT_ADMIN_ROLE on debt token already granted to ${governanceMultisig}`);
  }

  try {
    await ensureDefaultAdminExistsAndRevokeFrom(
      hre,
      "AmoDebtToken",
      debtTokenAddress,
      governanceMultisig,
      deployerAddress,
      deployerSigner,
      undefined,
      executor,
    );
  } catch {
    allComplete = false;
  }

  return allComplete;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, ethers } = hre;
  const { dusdDeployer } = await hre.getNamedAccounts();
  const deployerSigner = await ethers.getSigner(dusdDeployer);
  const config = await getConfig(hre);
  const executor = new GovernanceExecutor(hre, deployerSigner, config.safeConfig);
  await executor.initialize();

  console.log(`\n=== Configure IssuerV2_2 upgrade ===`);

  const issuerDeployment = await deployments.getOrNull(ISSUER_V2_2_CONTRACT_ID);

  if (!issuerDeployment) {
    console.log(`  ⚠️ ${ISSUER_V2_2_CONTRACT_ID} not deployed. Skipping configuration.`);
    return true;
  }

  const tokenAddress = config.dusd.address;
  const governanceMultisig = config.walletAddresses.governanceMultisig;
  const legacyIssuer = await deployments.getOrNull(ISSUER_V2_CONTRACT_ID);
  const managerDeployment = await deployments.getOrNull(AMO_MANAGER_V2_ID);
  const debtTokenDeployment = await deployments.getOrNull(AMO_DEBT_TOKEN_ID);
  const { address: vaultAddress } = await deployments.get(COLLATERAL_VAULT_CONTRACT_ID);

  let allComplete = true;

  // Move MINTER_ROLE from IssuerV2 to IssuerV2_2
  const minterComplete = await ensureMinterRole(hre, tokenAddress, issuerDeployment.address, executor);
  if (!minterComplete) allComplete = false;

  if (legacyIssuer && legacyIssuer.address.toLowerCase() !== issuerDeployment.address.toLowerCase()) {
    try {
      const stable = await hre.ethers.getContractAt("ERC20StablecoinUpgradeable", tokenAddress);
      const MINTER_ROLE = await stable.MINTER_ROLE();

      if (await stable.hasRole(MINTER_ROLE, legacyIssuer.address)) {
        const revoked = await executor.tryOrQueue(
          async () => {
            await stable.revokeRole(MINTER_ROLE, legacyIssuer.address);
            console.log(`    ➖ Revoked MINTER_ROLE from legacy issuer ${legacyIssuer.address}`);
          },
          () => createRevokeRoleTransaction(tokenAddress, MINTER_ROLE, legacyIssuer.address, stable.interface),
        );
        if (!revoked) allComplete = false;
      } else {
        console.log(`    ✓ Legacy issuer ${legacyIssuer.address} does not hold MINTER_ROLE`);
      }
    } catch (e) {
      console.log(`    ⚠️ Could not revoke MINTER_ROLE from legacy issuer: ${(e as Error).message}`);
      allComplete = false;
    }
  }

  // Migrate IssuerV2_2 roles to governance
  const issuerRolesComplete = await migrateIssuerRolesIdempotent(
    hre,
    issuerDeployment.address,
    deployerSigner,
    governanceMultisig,
    executor,
  );
  if (!issuerRolesComplete) allComplete = false;

  // Ensure AMO manager wiring
  if (managerDeployment) {
    console.log(`  📦 Configuring AmoManagerV2 at ${managerDeployment.address}`);
    const vaultRoleComplete = await ensureVaultWithdrawerRole(hre, vaultAddress, managerDeployment.address, executor);
    const managerRolesComplete = await migrateAmoManagerRoles(hre, managerDeployment.address, deployerSigner, governanceMultisig, executor);

    if (!(vaultRoleComplete && managerRolesComplete)) {
      allComplete = false;
    }
  } else {
    console.log(`  ℹ️ AmoManagerV2 not deployed; skipping manager configuration.`);
  }

  // Migrate debt token admin to governance
  if (debtTokenDeployment) {
    console.log(`  📦 Configuring AmoDebtToken at ${debtTokenDeployment.address}`);
    const collateralComplete = await ensureDebtTokenCollateral(hre, vaultAddress, debtTokenDeployment.address, executor);
    const debtAdminComplete = await migrateAmoDebtTokenAdmin(
      hre,
      debtTokenDeployment.address,
      deployerSigner,
      governanceMultisig,
      executor,
    );

    if (!(collateralComplete && debtAdminComplete)) {
      allComplete = false;
    }
  } else {
    console.log(`  ℹ️ AmoDebtToken not deployed; skipping debt token configuration.`);
  }

  if (!allComplete) {
    await executor.flush("IssuerV2_2 + AMO upgrade: governance operations");
    console.log("\n⏳ Some operations require governance signatures to complete.");
    console.log("   Re-run the script after the Safe batch is executed to finalize.");
    console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`);
    return false;
  }

  console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: ✅`);
  return true;
};

func.id = "23_02_setup_issuer_v2_2";
func.tags = ["dusd-upgrade", "setup-issuer-v2_2"];
func.dependencies = [COLLATERAL_VAULT_CONTRACT_ID, "dUSD", ISSUER_V2_2_CONTRACT_ID, AMO_MANAGER_V2_ID, AMO_DEBT_TOKEN_ID];

export default func;
