import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import {
  AMO_MANAGER_ID,
  COLLATERAL_VAULT_CONTRACT_ID,
  ISSUER_CONTRACT_ID,
  ISSUER_V2_CONTRACT_ID,
} from "../../utils/deploy-ids";
import { ensureDefaultAdminExistsAndRevokeFrom } from "../../utils/hardhat/access_control";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import { SafeTransactionData } from "../../typescript/safe/types";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";

const ZERO_BYTES_32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Ensure the given `grantee` holds MINTER_ROLE on the specified dUSD token.
 * Idempotent: grants the role only if it is not already present.
 *
 * @param hre Hardhat runtime environment
 * @param stableAddress Address of the ERC20Stablecoin token
 * @param grantee Address that should be granted MINTER_ROLE
 * @param manualActions Array to store manual actions if automated operations fail
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

async function ensureMinterRole(
  hre: HardhatRuntimeEnvironment,
  stableAddress: string,
  grantee: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const stable = await hre.ethers.getContractAt(
    "ERC20StablecoinUpgradeable",
    stableAddress,
  );
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
  } else {
    console.log(`    ✓ MINTER_ROLE already granted to ${grantee}`);
    return true;
  }
  return true;
}

/**
 * Migrate IssuerV2 roles to governance in a safe, idempotent sequence.
 * Grants roles to governance first, then revokes them from the deployer.
 *
 * @param hre Hardhat runtime environment
 * @param issuerName Logical name/id of the issuer deployment
 * @param issuerAddress Address of the IssuerV2 contract
 * @param deployerSigner Deployer signer currently holding roles
 * @param governanceMultisig Governance multisig address to receive roles
 * @param manualActions Array to store manual actions if automated operations fail
 */
async function migrateIssuerRolesIdempotent(
  hre: HardhatRuntimeEnvironment,
  issuerName: string,
  issuerAddress: string,
  deployerSigner: Signer,
  governanceMultisig: string,
  executor: GovernanceExecutor,
): Promise<boolean> {
  const issuer = await hre.ethers.getContractAt(
    "IssuerV2",
    issuerAddress,
    deployerSigner,
  );

  const DEFAULT_ADMIN_ROLE = ZERO_BYTES_32;
  const AMO_MANAGER_ROLE = await issuer.AMO_MANAGER_ROLE();
  const INCENTIVES_MANAGER_ROLE = await issuer.INCENTIVES_MANAGER_ROLE();
  const PAUSER_ROLE = await issuer.PAUSER_ROLE();

  const roles = [
    { name: "DEFAULT_ADMIN_ROLE", hash: DEFAULT_ADMIN_ROLE },
    { name: "AMO_MANAGER_ROLE", hash: AMO_MANAGER_ROLE },
    { name: "INCENTIVES_MANAGER_ROLE", hash: INCENTIVES_MANAGER_ROLE },
    { name: "PAUSER_ROLE", hash: PAUSER_ROLE },
  ];

  console.log(`  📄 Migrating roles for ${issuerName} at ${issuerAddress}`);

  let allComplete = true;
  for (const role of roles) {
    if (!(await issuer.hasRole(role.hash, governanceMultisig))) {
      const complete = await executor.tryOrQueue(
        async () => {
          await issuer.grantRole(role.hash, governanceMultisig);
          console.log(`    ➕ Granted ${role.name} to ${governanceMultisig}`);
        },
        () =>
          createGrantRoleTransaction(
            issuerAddress,
            role.hash,
            governanceMultisig,
            issuer.interface,
          ),
      );
      if (!complete) allComplete = false;
    } else {
      console.log(
        `    ✓ ${role.name} already granted to ${governanceMultisig}`,
      );
    }
  }

  // After ensuring governance has roles, revoke from deployer in a safe order
  const deployerAddress = await deployerSigner.getAddress();

  // Revoke roles from deployer to mirror realistic mainnet governance where deployer is not the governor
  for (const role of [AMO_MANAGER_ROLE, INCENTIVES_MANAGER_ROLE, PAUSER_ROLE]) {
    if (await issuer.hasRole(role, deployerAddress)) {
      const complete = await executor.tryOrQueue(
        async () => {
          await issuer.revokeRole(role, deployerAddress);
          console.log(`    ➖ Revoked ${role} from deployer`);
        },
        () =>
          createRevokeRoleTransaction(
            issuerAddress,
            role,
            deployerAddress,
            issuer.interface,
          ),
      );
      if (!complete) allComplete = false;
    }
  }
  // Safely migrate DEFAULT_ADMIN_ROLE away from deployer
  try {
    await ensureDefaultAdminExistsAndRevokeFrom(
      hre,
      "IssuerV2",
      issuerAddress,
      governanceMultisig,
      deployerAddress,
      deployerSigner,
    );
  } catch (e) {
    // In Safe mode, consider admin migration pending
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

  console.log(`\n=== Upgrading Issuer for dUSD ===`);

  const oldDeployment = await deployments.getOrNull(ISSUER_CONTRACT_ID);

  if (!oldDeployment) {
    console.log(
      `  ⚠️ Old issuer ${ISSUER_CONTRACT_ID} not found. Skipping deployment.`,
    );
    return true;
  }

  // Resolve dependency addresses
  const { address: oracleAggregatorAddress } =
    await deployments.get(ORACLE_AGGREGATOR_ID);
  const { address: collateralVaultAddress } = await deployments.get(
    COLLATERAL_VAULT_CONTRACT_ID,
  );
  const { address: amoManagerAddress } = await deployments.get(AMO_MANAGER_ID);
  const tokenAddress = config.dusd.address;

  // Deploy new IssuerV2 if not already deployed
  const result = await deployments.deploy(ISSUER_V2_CONTRACT_ID, {
    from: dusdDeployer,
    args: [
      collateralVaultAddress,
      tokenAddress,
      oracleAggregatorAddress,
      amoManagerAddress,
    ],
    contract: "IssuerV2",
    autoMine: true,
    log: false,
  });

  if (result.newlyDeployed) {
    console.log(`  ✅ Deployed ${ISSUER_V2_CONTRACT_ID} at ${result.address}`);
  } else {
    console.log(
      `  ✓ ${ISSUER_V2_CONTRACT_ID} already deployed at ${result.address}`,
    );
  }

  const newIssuerAddress = result.address;

  // Preemptively disable minting for wstkscUSD on this issuer BEFORE granting MINTER_ROLE
  // Do this only if the asset exists in config and is supported by the vault
  try {
    const wstkscUSDAddress = (config as any).tokenAddresses?.wstkscUSD as
      | string
      | undefined;

    if (wstkscUSDAddress && wstkscUSDAddress !== "") {
      const vaultContract = await hre.ethers.getContractAt(
        "CollateralHolderVault",
        collateralVaultAddress,
      );

      if (await vaultContract.isCollateralSupported(wstkscUSDAddress)) {
        const issuer = await hre.ethers.getContractAt(
          "IssuerV2",
          newIssuerAddress,
          deployerSigner,
        );
        const isEnabled: boolean =
          await issuer.isAssetMintingEnabled(wstkscUSDAddress);

        if (isEnabled) {
          try {
            await issuer.setAssetMintingPause(wstkscUSDAddress, true);
            console.log(
              `    ⛔ Disabled minting for wstkscUSD on issuer ${newIssuerAddress}`,
            );
          } catch (e) {
            console.log(
              `    ⚠️ Could not disable minting for wstkscUSD: ${(e as Error).message}`,
            );
          }
        } else {
          console.log(
            `    ✓ Minting for wstkscUSD already disabled on issuer ${newIssuerAddress}`,
          );
        }
      } else {
        console.log(
          `    ℹ️ wstkscUSD not supported by collateral vault ${collateralVaultAddress}; skipping issuer-level pause`,
        );
      }
    } else {
      console.log(
        "    ℹ️ wstkscUSD address not present in config.tokenAddresses; skipping issuer-level pause",
      );
    }
  } catch (e) {
    console.log(
      `    ⚠️ Could not pre-disable wstkscUSD minting: ${(e as Error).message}`,
    );
    // As a best-effort, add manual action to disable if applicable
    // (We cannot know collateral support here without the successful call.)
  }

  // Grant MINTER_ROLE on the token to the new issuer (idempotent)
  const minterComplete = await ensureMinterRole(
    hre,
    tokenAddress,
    newIssuerAddress,
    executor,
  );

  // Revoke MINTER_ROLE from the old issuer, but only after the new issuer has it
  try {
    const stable = await hre.ethers.getContractAt(
      "ERC20StablecoinUpgradeable",
      tokenAddress,
    );
    const MINTER_ROLE = await stable.MINTER_ROLE();

    if (
      oldDeployment.address.toLowerCase() !== newIssuerAddress.toLowerCase() &&
      (await stable.hasRole(MINTER_ROLE, oldDeployment.address))
    ) {
      const complete = await executor.tryOrQueue(
        async () => {
          await stable.revokeRole(MINTER_ROLE, oldDeployment.address);
          console.log(
            `    ➖ Revoked MINTER_ROLE from old issuer ${oldDeployment.address}`,
          );
        },
        () =>
          createRevokeRoleTransaction(
            tokenAddress,
            MINTER_ROLE,
            oldDeployment.address,
            stable.interface,
          ),
      );
      if (!complete) {
        // pending governance
      }
    } else {
      console.log(
        `    ✓ Old issuer ${oldDeployment.address} does not have MINTER_ROLE or equals new issuer`,
      );
    }
  } catch (e) {
    console.log(
      `    ⚠️ Could not check/revoke MINTER_ROLE on old issuer: ${(e as Error).message}`,
    );
  }

  // Migrate roles to governance multisig (always idempotent)
  const rolesComplete = await migrateIssuerRolesIdempotent(
    hre,
    ISSUER_V2_CONTRACT_ID,
    newIssuerAddress,
    deployerSigner,
    config.walletAddresses.governanceMultisig,
    executor,
  );

  // Optional: keep old issuer operational until governance flips references
  console.log(
    `  ℹ️ New issuer ${ISSUER_V2_CONTRACT_ID} deployed and permissioned. Ensure dApp/services reference ${newIssuerAddress}.`,
  );

  // Print manual actions, if any
  if (!(minterComplete && rolesComplete)) {
    await executor.flush("Setup IssuerV2: governance operations");
    console.log(
      "\n⏳ Some operations require governance signatures to complete.",
    );
    console.log(
      "   Re-run the script after the Safe batch is executed to finalize.",
    );
    console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`);
    return false;
  }

  console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: ✅`);
  return true;
};

func.id = "22_1_setup_issuerv2";
func.tags = ["setup-issuerv2"];
func.dependencies = [
  COLLATERAL_VAULT_CONTRACT_ID,
  "dUSD",
  ORACLE_AGGREGATOR_ID,
  AMO_MANAGER_ID,
];

export default func;
