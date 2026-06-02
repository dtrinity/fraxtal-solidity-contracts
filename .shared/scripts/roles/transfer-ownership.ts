#!/usr/bin/env ts-node

import { Command } from "commander";
import * as readline from "readline";

import { logger } from "../../lib/logger";
import { waitForTxReceipt } from "../../lib/transactions";
import { scanRolesAndOwnership } from "../../lib/roles/scan";
import { loadRoleManifest, resolveRoleManifest } from "../../lib/roles/manifest";
import { prepareContractPlans, isDeploymentExcluded } from "../../lib/roles/planner";

type ScanResult = Awaited<ReturnType<typeof scanRolesAndOwnership>>;

type ManifestSource = "auto" | "override";

interface OwnableTransferTarget {
  readonly kind: "ownable";
  readonly deployment: string;
  readonly contractName: string;
  readonly address: string;
  readonly currentOwner: string;
  readonly newOwner: string;
  readonly manifestSource: ManifestSource;
  readonly abi: ScanResult["ownableContracts"][number]["abi"];
}

interface ProxyAdminTransferTarget {
  readonly kind: "proxyAdmin";
  readonly deployment: string;
  readonly contractName: string;
  readonly address: string;
  readonly currentAdmin: string;
  readonly newAdmin: string;
  readonly manifestSource: ManifestSource;
  readonly abi: ScanResult["proxyAdminContracts"][number]["abi"];
}

type TransferTarget = OwnableTransferTarget | ProxyAdminTransferTarget;

interface ContractRef {
  readonly deployment: string;
  readonly contractName: string;
  readonly address: string;
  readonly manifestSource: ManifestSource;
}

interface OptOutRef {
  readonly deployment: string;
  readonly contractName: string;
  readonly address: string;
  readonly reason: string;
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return ["y", "yes"].includes(answer.trim().toLowerCase());
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .description(
      "Transfer Ownable ownership and upgradeable-proxy admin from the deployer to governance as defined in the manifest.",
    )
    .requiredOption("-m, --manifest <path>", "Path to the role manifest JSON")
    .requiredOption("-n, --network <name>", "Hardhat network to target")
    .option("--deployments-dir <path>", "Path to deployments directory (defaults to hardhat configured path)")
    .option("--hardhat-config <path>", "Path to hardhat.config.ts (defaults to ./hardhat.config.ts)")
    .option("--dry-run", "Simulate transfers without sending transactions")
    .option("--yes", "Skip confirmation prompt")
    .option("--json-output <path>", "Write summary report JSON to path (or stdout when set to '-')");

  program.parse(process.argv);
  const options = program.opts();

  process.env.HARDHAT_NETWORK = options.network;
  if (options.hardhatConfig) {
    process.env.HARDHAT_CONFIG = options.hardhatConfig;
    process.env.HARDHAT_USER_CONFIG = options.hardhatConfig;
  }

  try {
    const hre = require("hardhat");
    const manifest = resolveRoleManifest(loadRoleManifest(options.manifest));
    const dryRun = Boolean(options.dryRun);

    const scan = await scanRolesAndOwnership({
      hre,
      deployer: manifest.deployer,
      governanceMultisig: manifest.governance,
      timelock: manifest.timelock,
      deploymentsPath: options.deploymentsDir,
      logger: (msg: string) => logger.info(msg),
    });

    const rolesByDeployment = new Map(scan.rolesContracts.map((info) => [info.deploymentName, info]));
    const ownableByDeployment = new Map(scan.ownableContracts.map((info) => [info.deploymentName, info]));
    const proxyAdminByDeployment = new Map(scan.proxyAdminContracts.map((info) => [info.deploymentName, info]));
    const plans = prepareContractPlans({
      manifest,
      rolesByDeployment,
      ownableByDeployment,
      proxyAdminByDeployment,
    });

    const ownableActionable: OwnableTransferTarget[] = [];
    const proxyAdminActionable: ProxyAdminTransferTarget[] = [];
    const skippedAlreadyOwned: ContractRef[] = [];
    const skippedNotOwner: ContractRef[] = [];
    const skippedAlreadyGovernedProxy: ContractRef[] = [];
    const skippedNotProxyAdmin: ContractRef[] = [];
    const missingOwnable: ContractRef[] = [];
    const missingProxyAdmin: ContractRef[] = [];
    const manifestOptOuts: OptOutRef[] = [];

    for (const plan of plans) {
      if (plan.ownable) {
        const ownableInfo = ownableByDeployment.get(plan.deployment);
        const manifestSource: ManifestSource = (plan.ownableSource ?? "auto") as ManifestSource;

        if (!ownableInfo) {
          missingOwnable.push({
            deployment: plan.deployment,
            contractName: plan.alias ?? plan.deployment,
            address: "unknown",
            manifestSource,
          });
        } else if (ownableInfo.underGovernance) {
          skippedAlreadyOwned.push({
            deployment: plan.deployment,
            contractName: ownableInfo.name,
            address: ownableInfo.address,
            manifestSource,
          });
        } else if (!ownableInfo.deployerIsOwner) {
          skippedNotOwner.push({
            deployment: plan.deployment,
            contractName: ownableInfo.name,
            address: ownableInfo.address,
            manifestSource,
          });
        } else {
          ownableActionable.push({
            kind: "ownable",
            deployment: plan.deployment,
            contractName: ownableInfo.name,
            address: ownableInfo.address,
            currentOwner: ownableInfo.owner,
            newOwner: plan.ownable.newOwner,
            manifestSource,
            abi: ownableInfo.abi,
          });
        }
      }

      if (plan.proxyAdmin) {
        const proxyInfo = proxyAdminByDeployment.get(plan.deployment);
        const manifestSource: ManifestSource = (plan.proxyAdminSource ?? "auto") as ManifestSource;

        if (!proxyInfo) {
          missingProxyAdmin.push({
            deployment: plan.deployment,
            contractName: plan.alias ?? plan.deployment,
            address: "unknown",
            manifestSource,
          });
        } else if (proxyInfo.underGovernance) {
          skippedAlreadyGovernedProxy.push({
            deployment: plan.deployment,
            contractName: proxyInfo.name,
            address: proxyInfo.address,
            manifestSource,
          });
        } else if (!proxyInfo.deployerIsAdmin) {
          skippedNotProxyAdmin.push({
            deployment: plan.deployment,
            contractName: proxyInfo.name,
            address: proxyInfo.address,
            manifestSource,
          });
        } else {
          proxyAdminActionable.push({
            kind: "proxyAdmin",
            deployment: plan.deployment,
            contractName: proxyInfo.name,
            address: proxyInfo.address,
            currentAdmin: proxyInfo.admin,
            newAdmin: plan.proxyAdmin.newAdmin,
            manifestSource,
            abi: proxyInfo.abi,
          });
        }
      }
    }

    for (const ownableInfo of scan.ownableContracts) {
      if (!ownableInfo.deployerIsOwner) {
        continue;
      }

      const plan = plans.find((p) => p.deployment === ownableInfo.deploymentName);
      if (plan?.ownable) {
        continue;
      }

      if (isDeploymentExcluded(manifest, ownableInfo.deploymentName, "ownable")) {
        manifestOptOuts.push({
          deployment: ownableInfo.deploymentName,
          contractName: ownableInfo.name,
          address: ownableInfo.address,
          reason: "Manifest exclusion (ownable)",
        });
        continue;
      }

      const override = manifest.overrides.find((o) => o.deployment === ownableInfo.deploymentName);
      if (override?.ownable?.enabled === false) {
        manifestOptOuts.push({
          deployment: ownableInfo.deploymentName,
          contractName: ownableInfo.name,
          address: ownableInfo.address,
          reason: "Override disabled ownable actions",
        });
        continue;
      }

      if (!manifest.autoInclude.ownable) {
        manifestOptOuts.push({
          deployment: ownableInfo.deploymentName,
          contractName: ownableInfo.name,
          address: ownableInfo.address,
          reason: "Auto-include disabled and no ownable override present",
        });
      }
    }

    for (const proxyInfo of scan.proxyAdminContracts) {
      if (!proxyInfo.deployerIsAdmin) {
        continue;
      }

      const plan = plans.find((p) => p.deployment === proxyInfo.deploymentName);
      if (plan?.proxyAdmin) {
        continue;
      }

      if (isDeploymentExcluded(manifest, proxyInfo.deploymentName, "proxyAdmin")) {
        manifestOptOuts.push({
          deployment: proxyInfo.deploymentName,
          contractName: proxyInfo.name,
          address: proxyInfo.address,
          reason: "Manifest exclusion (proxyAdmin)",
        });
        continue;
      }

      const override = manifest.overrides.find((o) => o.deployment === proxyInfo.deploymentName);
      if (override?.proxyAdmin?.enabled === false) {
        manifestOptOuts.push({
          deployment: proxyInfo.deploymentName,
          contractName: proxyInfo.name,
          address: proxyInfo.address,
          reason: "Override disabled proxyAdmin actions",
        });
        continue;
      }

      if (!manifest.autoInclude.proxyAdmin) {
        manifestOptOuts.push({
          deployment: proxyInfo.deploymentName,
          contractName: proxyInfo.name,
          address: proxyInfo.address,
          reason: "Auto-include disabled and no proxyAdmin override present",
        });
      }
    }

    const actionable: TransferTarget[] = [...ownableActionable, ...proxyAdminActionable];

    logger.info("\n=== Ownership / Proxy Admin Transfer Plan ===");
    logger.info(`Pending Ownable transfers: ${ownableActionable.length}`);
    logger.info(`Pending proxy admin transfers: ${proxyAdminActionable.length}`);
    logger.info(`Already owned by governance (Ownable): ${skippedAlreadyOwned.length}`);
    logger.info(`Skipped (deployer not owner): ${skippedNotOwner.length}`);
    logger.info(`Already governed (proxy admin): ${skippedAlreadyGovernedProxy.length}`);
    logger.info(`Skipped (deployer not proxy admin): ${skippedNotProxyAdmin.length}`);
    logger.info(`Missing Ownable metadata: ${missingOwnable.length}`);
    logger.info(`Missing proxy admin metadata: ${missingProxyAdmin.length}`);
    logger.info(`Manifest opt-outs: ${manifestOptOuts.length}`);

    if (actionable.length === 0) {
      logger.success("\nNo ownership or proxy admin transfers required.");
      await emitJson(options.jsonOutput, {
        status: "no-action",
        executed: [],
        skippedAlreadyOwned,
        skippedNotOwner,
        skippedAlreadyGovernedProxy,
        skippedNotProxyAdmin,
        missingOwnable,
        missingProxyAdmin,
        manifestOptOuts,
        failures: [],
      });
      return;
    }

    logger.warn("\n⚠️ Transfers are irreversible. Verify each target carefully before proceeding.");
    actionable.forEach((item, index) => {
      if (item.kind === "ownable") {
        logger.info(
          `- [${index + 1}/${actionable.length}] ${item.contractName} (${item.address}) :: owner=${item.currentOwner} -> ${item.newOwner} (${item.manifestSource})`,
        );
      } else {
        logger.info(
          `- [${index + 1}/${actionable.length}] ${item.contractName} (${item.address}) :: proxyAdmin=${item.currentAdmin} -> ${item.newAdmin} (${item.manifestSource})`,
        );
      }
    });

    if (!dryRun && !options.yes) {
      const confirmed = await promptYesNo("\nProceed with ownership / proxy admin transfers? (yes/no): ");
      if (!confirmed) {
        logger.info("Aborted by user.");
        return;
      }
    }

    const signer = await hre.ethers.getSigner(manifest.deployer);
    const executed: TransferTarget[] = [];
    const failures: { target: TransferTarget; error: string }[] = [];

    for (let index = 0; index < actionable.length; index += 1) {
      const target = actionable[index];

      if (target.kind === "ownable") {
        logger.info(
          `\n[${index + 1}/${actionable.length}] Transferring ownership of ${target.contractName} (${target.address})`,
        );

        try {
          const contract = await hre.ethers.getContractAt(target.abi as any, target.address, signer);

          if (dryRun) {
            logger.info("  [dry-run] Would call transferOwnership(newOwner)");
            executed.push(target);
            continue;
          }

          const tx = await contract.transferOwnership(target.newOwner);
          const receipt = await waitForTxReceipt(tx, {
            onRetry: (message) => logger.warn(`  ${message}`),
          });
          const txHash = receipt?.hash ?? tx.hash ?? "unknown";
          logger.info(`  ✅ Transaction hash: ${txHash}`);
          executed.push(target);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`  ❌ Failed to transfer ownership: ${message}`);
          failures.push({ target, error: message });
        }
        continue;
      }

      logger.info(
        `\n[${index + 1}/${actionable.length}] Transferring proxy admin of ${target.contractName} (${target.address})`,
      );

      try {
        const contract = await hre.ethers.getContractAt(target.abi as any, target.address, signer);

        if (dryRun) {
          logger.info("  [dry-run] Would call changeAdmin(newAdmin)");
          executed.push(target);
          continue;
        }

        const tx = await contract.changeAdmin(target.newAdmin);
        const receipt = await waitForTxReceipt(tx, {
          onRetry: (message) => logger.warn(`  ${message}`),
        });
        const txHash = receipt?.hash ?? tx.hash ?? "unknown";
        logger.info(`  ✅ Transaction hash: ${txHash}`);
        executed.push(target);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`  ❌ Failed to transfer proxy admin: ${message}`);
        failures.push({ target, error: message });
      }
    }

    logger.info("\n=== Summary ===");
    logger.info(`Transfers executed: ${executed.length}`);
    logger.info(`Already owned by governance (Ownable): ${skippedAlreadyOwned.length}`);
    logger.info(`Skipped (deployer not owner): ${skippedNotOwner.length}`);
    logger.info(`Already governed (proxy admin): ${skippedAlreadyGovernedProxy.length}`);
    logger.info(`Skipped (deployer not proxy admin): ${skippedNotProxyAdmin.length}`);
    logger.info(`Manifest opt-outs: ${manifestOptOuts.length}`);
    logger.info(`Failures: ${failures.length}`);

    if (manifestOptOuts.length > 0) {
      logger.info("\nManifest opt-outs:");
      for (const opt of manifestOptOuts) {
        logger.info(`- ${opt.contractName} (${opt.address}) :: ${opt.reason}`);
      }
    }

    if (failures.length > 0) {
      logger.error("\nFailures:");
      for (const failure of failures) {
        logger.error(`- ${failure.target.contractName} (${failure.target.address}) :: ${failure.error}`);
      }
    }

    await emitJson(options.jsonOutput, {
      status: dryRun ? "dry-run" : "executed",
      executed,
      skippedAlreadyOwned,
      skippedNotOwner,
      skippedAlreadyGovernedProxy,
      skippedNotProxyAdmin,
      missingOwnable,
      missingProxyAdmin,
      manifestOptOuts,
      failures,
    });
  } catch (error) {
    logger.error("Failed to transfer ownership.");
    logger.error(String(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  }
}

async function emitJson(
  outputPath: string | undefined,
  payload: {
    status: "executed" | "dry-run" | "no-action";
    executed: TransferTarget[];
    skippedAlreadyOwned: ContractRef[];
    skippedNotOwner: ContractRef[];
    skippedAlreadyGovernedProxy: ContractRef[];
    skippedNotProxyAdmin: ContractRef[];
    missingOwnable: ContractRef[];
    missingProxyAdmin: ContractRef[];
    manifestOptOuts: OptOutRef[];
    failures: { target: TransferTarget; error: string }[];
  },
): Promise<void> {
  if (!outputPath) {
    return;
  }

  const serialized = JSON.stringify(payload, null, 2);
  if (outputPath === "-") {
    // eslint-disable-next-line no-console
    console.log(serialized);
    return;
  }

  const fs = require("fs");
  const path = require("path");
  const resolved = path.isAbsolute(outputPath) ? outputPath : path.join(process.cwd(), outputPath);
  fs.writeFileSync(resolved, serialized);
  logger.info(`\nSaved JSON report to ${resolved}`);
}

void main();
