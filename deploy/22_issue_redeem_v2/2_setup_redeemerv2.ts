import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { dUSD_REDEEMER_WITH_FEES_CONTRACT_ID } from "../../typescript/deploy-ids";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { SafeTransactionData } from "../../typescript/safe/types";
import {
  COLLATERAL_VAULT_CONTRACT_ID,
  REDEEMER_CONTRACT_ID,
  REDEEMER_V2_CONTRACT_ID,
} from "../../utils/deploy-ids";
import { ensureDefaultAdminExistsAndRevokeFrom } from "../../utils/hardhat/access_control";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const ZERO_BYTES_32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Build Safe transaction data for AccessControl.grantRole.
 *
 * @param contractAddress Contract address to call
 * @param role Role identifier (bytes32) to grant
 * @param grantee Address that should receive the role
 * @param contractInterface Interface used to encode the function call
 * @returns Safe transaction data for grantRole
 */
function createGrantRoleTransaction(
  contractAddress: string,
  role: string,
  grantee: string,
  contractInterface: any,
): SafeTransactionData {
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
 * @returns Safe transaction data for revokeRole
 */
function createRevokeRoleTransaction(
  contractAddress: string,
  role: string,
  account: string,
  contractInterface: any,
): SafeTransactionData {
  return {
    to: contractAddress,
    value: "0",
    data: contractInterface.encodeFunctionData("revokeRole", [role, account]),
  };
}

/**
 * Migrate RedeemerV2 roles to governance in a safe, idempotent sequence.
 * Grants roles to governance first, then revokes them from the deployer.
 *
 * @param hre Hardhat runtime environment
 * @param redeemerAddress Address of the RedeemerV2 contract
 * @param deployerAddress Address of the deployer currently holding roles
 * @param governanceMultisig Governance multisig address to receive roles
 * @param executor Governance executor helper for direct/queued execution
 * @returns True if complete, false if pending governance
 */
async function migrateRedeemerRolesIdempotent(
  hre: HardhatRuntimeEnvironment,
  redeemerAddress: string,
  deployerAddress: string,
  governanceMultisig: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const redeemer = await hre.ethers.getContractAt(
    "RedeemerV2",
    redeemerAddress,
  );
  const DEFAULT_ADMIN_ROLE = ZERO_BYTES_32;
  const REDEMPTION_MANAGER_ROLE = await redeemer.REDEMPTION_MANAGER_ROLE();
  const PAUSER_ROLE = await redeemer.PAUSER_ROLE();

  const roles = [
    { name: "DEFAULT_ADMIN_ROLE", hash: DEFAULT_ADMIN_ROLE },
    { name: "REDEMPTION_MANAGER_ROLE", hash: REDEMPTION_MANAGER_ROLE },
    { name: "PAUSER_ROLE", hash: PAUSER_ROLE },
  ];

  let allComplete = true;

  for (const role of roles) {
    if (!(await redeemer.hasRole(role.hash, governanceMultisig))) {
      const complete = await executor.tryOrQueue(
        async () => {
          await redeemer.grantRole(role.hash, governanceMultisig);
          console.log(`    ➕ Granted ${role.name} to ${governanceMultisig}`);
        },
        () =>
          createGrantRoleTransaction(
            redeemerAddress,
            role.hash,
            governanceMultisig,
            redeemer.interface,
          ),
      );
      if (!complete) allComplete = false;
    } else {
      console.log(
        `    ✓ ${role.name} already granted to ${governanceMultisig}`,
      );
    }
  }

  // Revoke roles from deployer to mirror realistic governance
  for (const role of [REDEMPTION_MANAGER_ROLE, PAUSER_ROLE]) {
    if (await redeemer.hasRole(role, deployerAddress)) {
      const complete = await executor.tryOrQueue(
        async () => {
          await redeemer.revokeRole(role, deployerAddress);
          console.log(`    ➖ Revoked ${role} from deployer`);
        },
        () =>
          createRevokeRoleTransaction(
            redeemerAddress,
            role,
            deployerAddress,
            redeemer.interface,
          ),
      );
      if (!complete) allComplete = false;
    }
  }

  // Safely migrate DEFAULT_ADMIN_ROLE away from deployer
  try {
    await ensureDefaultAdminExistsAndRevokeFrom(
      hre,
      "RedeemerV2",
      redeemerAddress,
      governanceMultisig,
      deployerAddress,
      await hre.ethers.getSigner(deployerAddress),
      undefined,
      executor,
    );
  } catch {
    allComplete = false;
  }
  return allComplete;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const { dusdDeployer } = await hre.getNamedAccounts();
  const config = await getConfig(hre);
  const executor = new GovernanceExecutor(
    hre,
    await hre.ethers.getSigner(dusdDeployer),
    config.safeConfig,
  );
  await executor.initialize();

  console.log(`\n=== Deploy RedeemerV2 for dUSD ===`);

  const { address: oracle } = await deployments.get(ORACLE_AGGREGATOR_ID);
  const { address: vault } = await deployments.get(
    COLLATERAL_VAULT_CONTRACT_ID,
  );

  const tokenAddress = config.dusd.address;
  const initialFeeReceiver =
    config.dStables?.dUSD?.initialFeeReceiver || dusdDeployer;
  const initialRedemptionFeeBps =
    config.dStables?.dUSD?.initialRedemptionFeeBps !== undefined
      ? config.dStables.dUSD.initialRedemptionFeeBps
      : 0;

  const result = await deployments.deploy(REDEEMER_V2_CONTRACT_ID, {
    from: dusdDeployer,
    args: [
      vault,
      tokenAddress,
      oracle,
      initialFeeReceiver,
      initialRedemptionFeeBps,
    ],
    contract: "RedeemerV2",
    autoMine: true,
    log: false,
  });

  if (result.newlyDeployed) {
    console.log(
      `  ✅ Deployed ${REDEEMER_V2_CONTRACT_ID} at ${result.address}`,
    );
  } else {
    console.log(`  ✓ ${REDEEMER_V2_CONTRACT_ID} already at ${result.address}`);
  }

  // Configure per-collateral redemption fees before migrating roles
  try {
    const fees = config.dStables?.dUSD?.collateralRedemptionFees;

    if (fees && Object.keys(fees).length > 0) {
      const redeemer = await hre.ethers.getContractAt(
        "RedeemerV2",
        result.address,
        await hre.ethers.getSigner(dusdDeployer),
      );

      for (const [asset, feeBps] of Object.entries(fees)) {
        try {
          const overridden = await (redeemer as any).isCollateralFeeOverridden(
            asset,
          );
          const current = await (redeemer as any).collateralRedemptionFeeBps(
            asset,
          );
          const desired = BigInt(feeBps as number);
          const currentBps = BigInt(current.toString());

          if (!overridden || currentBps !== desired) {
            await redeemer.setCollateralRedemptionFee(asset, feeBps as number);
            console.log(
              `    ⚙️ Set fee override for ${asset} to ${feeBps as number}`,
            );
          } else {
            console.log(
              `    ✓ Fee override for ${asset} already ${currentBps}`,
            );
          }
        } catch (e) {
          console.log(
            `    ⚠️ Could not set fee for ${asset}: ${(e as Error).message}`,
          );
        }
      }
    } else {
      console.log(
        "    ℹ️ No per-collateral fee overrides specified in config.",
      );
    }
  } catch (e) {
    console.log(
      `    ⚠️ Per-collateral fee setup skipped: ${(e as Error).message}`,
    );
  }

  // Grant vault withdraw permission to new redeemer and revoke from old redeemer
  let vaultOpsComplete = true;
  try {
    const vaultContract = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      vault,
      await hre.ethers.getSigner(dusdDeployer),
    );
    const WITHDRAWER_ROLE = await vaultContract.COLLATERAL_WITHDRAWER_ROLE();

    if (!(await vaultContract.hasRole(WITHDRAWER_ROLE, result.address))) {
      const complete = await executor.tryOrQueue(
        async () => {
          await vaultContract.grantRole(WITHDRAWER_ROLE, result.address);
          console.log(
            `    ➕ Granted COLLATERAL_WITHDRAWER_ROLE to new redeemer ${result.address}`,
          );
        },
        () =>
          createGrantRoleTransaction(
            vault,
            WITHDRAWER_ROLE,
            result.address,
            vaultContract.interface,
          ),
      );
      if (!complete) vaultOpsComplete = false;
    }
    // Revoke role from any legacy redeemer deployments (Redeemer and RedeemerWithFees)
    const legacyRedeemerIds = [
      REDEEMER_CONTRACT_ID,
      dUSD_REDEEMER_WITH_FEES_CONTRACT_ID,
    ];

    for (const legacyId of legacyRedeemerIds) {
      const legacyDeployment = await deployments.getOrNull(legacyId);

      if (
        legacyDeployment &&
        legacyDeployment.address.toLowerCase() !==
          result.address.toLowerCase() &&
        (await vaultContract.hasRole(WITHDRAWER_ROLE, legacyDeployment.address))
      ) {
        const complete = await executor.tryOrQueue(
          async () => {
            await vaultContract.revokeRole(
              WITHDRAWER_ROLE,
              legacyDeployment.address,
            );
            console.log(
              `    ➖ Revoked COLLATERAL_WITHDRAWER_ROLE from legacy ${legacyId} at ${legacyDeployment.address}`,
            );
          },
          () =>
            createRevokeRoleTransaction(
              vault,
              WITHDRAWER_ROLE,
              legacyDeployment.address,
              vaultContract.interface,
            ),
        );
        if (!complete) vaultOpsComplete = false;
      }
    }
  } catch (e) {
    console.log(
      `    ⚠️ Could not update vault withdrawer roles: ${(e as Error).message}`,
    );
  }

  // Post-deploy configuration no longer needed for fee receiver and default fee,
  // as they are provided via constructor.

  // Note: We intentionally do not modify roles on the legacy Redeemer contract to avoid unnecessary gas.

  // Migrate roles to governance multisig (idempotent)
  const rolesComplete = await migrateRedeemerRolesIdempotent(
    hre,
    result.address,
    dusdDeployer,
    config.walletAddresses.governanceMultisig,
    executor,
  );

  if (!(vaultOpsComplete && rolesComplete)) {
    await executor.flush("Setup RedeemerV2: governance operations");
    console.log(
      "\n⏳ Some operations require governance signatures to complete.",
    );
    console.log(
      "   Re-run the script after the Safe batch is executed to finalize.",
    );
    console.log(
      `\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`,
    );
    return false;
  }

  console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: ✅`);
  return true;
};

func.id = "22_2_setup_redeemerv2";
func.tags = ["setup-redeemerv2"];
func.dependencies = [
  COLLATERAL_VAULT_CONTRACT_ID,
  "dUSD",
  ORACLE_AGGREGATOR_ID,
];

export default func;
