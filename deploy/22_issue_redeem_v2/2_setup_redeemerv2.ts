import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
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
 * Migrate roles to governance multisig (always idempotent)
 *
 * @param hre HardhatRuntimeEnvironment
 * @param redeemerAddress Address of the RedeemerV2 contract
 * @param deployerAddress Address of the deployer
 * @param governanceMultisig Address of the governance multisig
 * @param manualActions Array to store manual actions if automated operations fail
 */
async function migrateRedeemerRolesIdempotent(
  hre: HardhatRuntimeEnvironment,
  redeemerAddress: string,
  deployerAddress: string,
  governanceMultisig: string,
  manualActions?: string[],
): Promise<void> {
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

  for (const role of roles) {
    if (!(await redeemer.hasRole(role.hash, governanceMultisig))) {
      try {
        await redeemer.grantRole(role.hash, governanceMultisig);
        console.log(`    ➕ Granted ${role.name} to ${governanceMultisig}`);
      } catch (e) {
        console.log(
          `    ⚠️ Could not grant ${role.name} to ${governanceMultisig}: ${(e as Error).message}`,
        );
        manualActions?.push(
          `RedeemerV2 (${redeemerAddress}).grantRole(${role.name}, ${governanceMultisig})`,
        );
      }
    } else {
      console.log(
        `    ✓ ${role.name} already granted to ${governanceMultisig}`,
      );
    }
  }

  // Revoke roles from deployer to mirror realistic governance
  for (const role of [REDEMPTION_MANAGER_ROLE, PAUSER_ROLE]) {
    if (await redeemer.hasRole(role, deployerAddress)) {
      try {
        await redeemer.revokeRole(role, deployerAddress);
        console.log(`    ➖ Revoked ${role} from deployer`);
      } catch (e) {
        console.log(
          `    ⚠️ Could not revoke ${role} from deployer: ${(e as Error).message}`,
        );
        const roleName =
          role === REDEMPTION_MANAGER_ROLE
            ? "REDEMPTION_MANAGER_ROLE"
            : "PAUSER_ROLE";
        manualActions?.push(
          `RedeemerV2 (${redeemerAddress}).revokeRole(${roleName}, ${deployerAddress})`,
        );
      }
    }
  }
  // Safely migrate DEFAULT_ADMIN_ROLE away from deployer
  await ensureDefaultAdminExistsAndRevokeFrom(
    hre,
    "RedeemerV2",
    redeemerAddress,
    governanceMultisig,
    deployerAddress,
    await hre.ethers.getSigner(deployerAddress),
    manualActions,
  );
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments } = hre;
  const { dusdDeployer } = await hre.getNamedAccounts();
  const config = await getConfig(hre);
  const manualActions: string[] = [];

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

  // Grant vault withdraw permission to new redeemer and revoke from old redeemer
  try {
    const vaultContract = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      vault,
      await hre.ethers.getSigner(dusdDeployer),
    );
    const WITHDRAWER_ROLE = await vaultContract.COLLATERAL_WITHDRAWER_ROLE();

    if (!(await vaultContract.hasRole(WITHDRAWER_ROLE, result.address))) {
      try {
        await vaultContract.grantRole(WITHDRAWER_ROLE, result.address);
        console.log(
          `    ➕ Granted COLLATERAL_WITHDRAWER_ROLE to new redeemer ${result.address}`,
        );
      } catch (e) {
        console.log(
          `    ⚠️ Could not grant COLLATERAL_WITHDRAWER_ROLE to ${result.address}: ${(e as Error).message}`,
        );
        manualActions.push(
          `CollateralHolderVault (${vault}).grantRole(COLLATERAL_WITHDRAWER_ROLE, ${result.address})`,
        );
      }
    }
    const oldRedeemerDeployment =
      await deployments.getOrNull(REDEEMER_CONTRACT_ID);

    if (
      oldRedeemerDeployment &&
      (await vaultContract.hasRole(
        WITHDRAWER_ROLE,
        oldRedeemerDeployment.address,
      ))
    ) {
      try {
        await vaultContract.revokeRole(
          WITHDRAWER_ROLE,
          oldRedeemerDeployment.address,
        );
        console.log(
          `    ➖ Revoked COLLATERAL_WITHDRAWER_ROLE from old redeemer ${oldRedeemerDeployment.address}`,
        );
      } catch (e) {
        console.log(
          `    ⚠️ Could not revoke COLLATERAL_WITHDRAWER_ROLE from old redeemer: ${(e as Error).message}`,
        );
        manualActions.push(
          `CollateralHolderVault (${vault}).revokeRole(COLLATERAL_WITHDRAWER_ROLE, ${oldRedeemerDeployment.address})`,
        );
      }
    }
  } catch (e) {
    console.log(
      `    ⚠️ Could not update vault withdrawer roles: ${(e as Error).message}`,
    );
    manualActions.push(
      `CollateralHolderVault (${vault}).grantRole(COLLATERAL_WITHDRAWER_ROLE, ${result.address})`,
    );
  }

  // Post-deploy configuration no longer needed for fee receiver and default fee,
  // as they are provided via constructor.

  // Note: We intentionally do not modify roles on the legacy Redeemer contract to avoid unnecessary gas.

  // Migrate roles to governance multisig (idempotent)
  await migrateRedeemerRolesIdempotent(
    hre,
    result.address,
    dusdDeployer,
    config.walletAddresses.governanceMultisig,
    manualActions,
  );

  if (manualActions.length > 0) {
    console.log("\n⚠️  Manual actions required to finalize RedeemerV2 setup:");
    manualActions.forEach((a: string) => console.log(`   - ${a}`));
  }

  console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: ✅`);
  return true;
};

func.id = "22_2_setup_redeemerv2";
func.tags = ["setup-issuerv2", "setup-redeemerv2"];
func.dependencies = [
  COLLATERAL_VAULT_CONTRACT_ID,
  "dUSD",
  ORACLE_AGGREGATOR_ID,
];

export default func;
