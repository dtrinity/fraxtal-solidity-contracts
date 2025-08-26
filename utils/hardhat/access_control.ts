import { Signer } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";

export const ZERO_BYTES_32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Safely migrate DEFAULT_ADMIN_ROLE from one admin to another.
 *
 * Guarantees:
 * - Ensures/attempts `adminToKeep` has DEFAULT_ADMIN_ROLE before removing it from `adminToRevoke`.
 * - If caller is the same as `adminToRevoke`, will self-renounce via renounceRole once `adminToKeep` is confirmed.
 * - Falls back to manual actions when permissions are insufficient.
 */
export async function ensureDefaultAdminExistsAndRevokeFrom(
  hre: HardhatRuntimeEnvironment,
  contractName: string,
  contractAddress: string,
  adminToKeep: string,
  adminToRevoke: string,
  callerSigner: Signer,
  manualActions?: string[],
  executor?: GovernanceExecutor,
): Promise<void> {
  const contract = await hre.ethers.getContractAt(
    contractName,
    contractAddress,
    callerSigner,
  );
  const DEFAULT_ADMIN_ROLE = ZERO_BYTES_32;
  const contractRef = `${contractName} (${contractAddress})`;

  // Phase 1: Ensure adminToKeep has DEFAULT_ADMIN_ROLE
  try {
    const hasAdmin = await contract.hasRole(DEFAULT_ADMIN_ROLE, adminToKeep);
    if (!hasAdmin) {
      try {
        await contract.grantRole(DEFAULT_ADMIN_ROLE, adminToKeep);
        console.log(
          `    ➕ Granted DEFAULT_ADMIN_ROLE to ${adminToKeep} on ${contractName}`,
        );
      } catch (e) {
        // Try to queue via Safe if available
        if (executor) {
          await executor.tryOrQueue(
            async () => {
              await contract.grantRole(DEFAULT_ADMIN_ROLE, adminToKeep);
            },
            () => ({
              to: contractAddress,
              value: "0",
              data: contract.interface.encodeFunctionData("grantRole", [
                DEFAULT_ADMIN_ROLE,
                adminToKeep,
              ]),
            }),
          );
        }
        manualActions?.push(
          `${contractRef}.grantRole(DEFAULT_ADMIN_ROLE, ${adminToKeep})`,
        );
      }
    }
  } catch (e) {
    console.log(
      `    ⚠️ Could not check/grant DEFAULT_ADMIN_ROLE for ${adminToKeep} on ${contractName}: ${(e as Error).message}`,
    );
    // Best effort: still queue grant if Safe is available
    if (executor) {
      await executor.tryOrQueue(
        async () => {
          await contract.grantRole(DEFAULT_ADMIN_ROLE, adminToKeep);
        },
        () => ({
          to: contractAddress,
          value: "0",
          data: contract.interface.encodeFunctionData("grantRole", [
            DEFAULT_ADMIN_ROLE,
            adminToKeep,
          ]),
        }),
      );
    }
    manualActions?.push(
      `${contractRef}.grantRole(DEFAULT_ADMIN_ROLE, ${adminToKeep})`,
    );
  }

  // Phase 2: Confirm adminToKeep has admin before proceeding with removal from adminToRevoke
  try {
    const keepHasAdmin = await contract.hasRole(
      DEFAULT_ADMIN_ROLE,
      adminToKeep,
    );
    if (!keepHasAdmin) {
      // Do not proceed with removal to avoid lockout
      console.log(
        `    ⚠️ Skipping DEFAULT_ADMIN_ROLE revoke: ${adminToKeep} does not yet have admin on ${contractName}`,
      );
      manualActions?.push(
        `${contractRef}.grantRole(DEFAULT_ADMIN_ROLE, ${adminToKeep})`,
      );
      return;
    }
  } catch (e) {
    console.log(
      `    ⚠️ Could not confirm ${adminToKeep} DEFAULT_ADMIN_ROLE on ${contractName}: ${(e as Error).message}`,
    );
    manualActions?.push(
      `${contractRef}.grantRole(DEFAULT_ADMIN_ROLE, ${adminToKeep})`,
    );
    return;
  }

  // Phase 3: Remove DEFAULT_ADMIN_ROLE from adminToRevoke (self-renounce if caller == adminToRevoke)
  try {
    const revokeNeeded = await contract.hasRole(
      DEFAULT_ADMIN_ROLE,
      adminToRevoke,
    );
    if (!revokeNeeded) {
      return;
    }
  } catch (e) {
    console.log(
      `    ⚠️ Could not check ${adminToRevoke} DEFAULT_ADMIN_ROLE on ${contractName}: ${(e as Error).message}`,
    );
    manualActions?.push(
      `${contractRef}.revokeRole(DEFAULT_ADMIN_ROLE, ${adminToRevoke})`,
    );
    return;
  }

  const caller = (await callerSigner.getAddress()).toLowerCase();
  if (caller === adminToRevoke.toLowerCase()) {
    // Self-removal path: use renounceRole after confirming adminToKeep already has admin
    try {
      await contract.renounceRole(DEFAULT_ADMIN_ROLE, adminToRevoke);
      console.log(
        `    ➖ Renounced DEFAULT_ADMIN_ROLE for ${adminToRevoke} on ${contractName}`,
      );
    } catch (e) {
      // Fallback: queue a revoke via Safe (governance) if available
      if (executor) {
        await executor.tryOrQueue(
          async () => {
            await contract.revokeRole(DEFAULT_ADMIN_ROLE, adminToRevoke);
          },
          () => ({
            to: contractAddress,
            value: "0",
            data: contract.interface.encodeFunctionData("revokeRole", [
              DEFAULT_ADMIN_ROLE,
              adminToRevoke,
            ]),
          }),
        );
      }
      manualActions?.push(
        `${contractRef}.revokeRole(DEFAULT_ADMIN_ROLE, ${adminToRevoke})`,
      );
    }
    return;
  }

  try {
    await contract.revokeRole(DEFAULT_ADMIN_ROLE, adminToRevoke);
    console.log(
      `    ➖ Revoked DEFAULT_ADMIN_ROLE from ${adminToRevoke} on ${contractName}`,
    );
  } catch (e) {
    // Try queueing revoke via Safe (governance)
    if (executor) {
      await executor.tryOrQueue(
        async () => {
          await contract.revokeRole(DEFAULT_ADMIN_ROLE, adminToRevoke);
        },
        () => ({
          to: contractAddress,
          value: "0",
          data: contract.interface.encodeFunctionData("revokeRole", [
            DEFAULT_ADMIN_ROLE,
            adminToRevoke,
          ]),
        }),
      );
    }
    manualActions?.push(
      `${contractRef}.revokeRole(DEFAULT_ADMIN_ROLE, ${adminToRevoke})`,
    );
  }
}
