#!/usr/bin/env ts-node

import { Command } from "commander";
import fs from "fs";
import path from "path";

import { logger } from "../../lib/logger";
import { findProjectRoot } from "../../lib/utils";
import { patchEtherscanV2ChainIdSupport, isAlreadyVerifiedError } from "../../lib/verification/etherscan";

type VerifyOptions = {
  network?: string;
  deploymentsDir?: string;
  only?: Set<string>;
  match?: RegExp;
  force?: boolean;
  dryRun?: boolean;
  hardhatConfig?: string;
};

type DeploymentRecord = {
  address: string;
  args?: unknown[];
  metadata?: string;
};

async function main(): Promise<void> {
  const program = new Command();

  program
    .description("Verify Hardhat deployments against an Etherscan-style explorer (with Etherscan v2 chainid support).")
    .option("-n, --network <name>", "Hardhat network to target")
    .option("--deployments-dir <path>", "Deployments directory (defaults to ./deployments)")
    .option("--only <names>", "Comma-separated list of deployment names to verify")
    .option("--match <regex>", "Only verify deployments whose name matches this regex")
    .option("--force", "Re-verify even if the contract is already verified")
    .option("--dry-run", "Print the plan without calling the explorer")
    .option("--hardhat-config <path>", "Path to hardhat.config.ts (defaults to ./hardhat.config.ts)");

  program.parse(process.argv);
  const cli = program.opts();

  const opts: VerifyOptions = {
    network: cli.network as string | undefined,
    deploymentsDir: cli.deploymentsDir as string | undefined,
    only: cli.only ? new Set((cli.only as string).split(",").map((s) => s.trim()).filter(Boolean)) : undefined,
    match: cli.match ? new RegExp(escapeRegExp(cli.match as string)) : undefined,
    force: Boolean(cli.force),
    dryRun: Boolean(cli.dryRun),
    hardhatConfig: cli.hardhatConfig as string | undefined,
  };

  if (opts.network) {
    process.env.HARDHAT_NETWORK = opts.network;
  }
  if (opts.hardhatConfig) {
    process.env.HARDHAT_CONFIG = opts.hardhatConfig;
    process.env.HARDHAT_USER_CONFIG = opts.hardhatConfig;
  }

  patchEtherscanV2ChainIdSupport();

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hre = require("hardhat");
    const deployments = (await hre.deployments.all({
      deployments: opts.deploymentsDir,
    })) as Record<string, DeploymentRecord>;

    const filtered = Object.entries(deployments).filter(([name]) => {
      if (opts.only && !opts.only.has(name)) return false;
      if (opts.match && !opts.match.test(name)) return false;
      return true;
    });

    if (filtered.length === 0) {
      logger.info("No deployments matched the provided filters.");
      return;
    }

    logger.info(`Verifying ${filtered.length} deployment(s)...`);
    for (const [deploymentName, deployment] of filtered) {
      const constructorArguments = deployment.args ?? [];

      const fqName = extractFullyQualifiedName(deployment.metadata);

      logger.info(`\nverifying ${deploymentName} (${deployment.address}) on ${hre.network.name}...`);

      if (opts.dryRun) {
        logger.info("  [dry-run] would call verify:verify");
        continue;
      }

      try {
        await hre.run("verify:verify", {
          address: deployment.address,
          constructorArguments,
          contract: fqName,
        });
        logger.success(`✅ verified ${deploymentName}`);
      } catch (error) {
        if (isAlreadyVerifiedError(error) && !opts.force) {
          logger.info(`✅ skipping ${deploymentName}: already verified`);
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`⚠️  verification skipped for ${deploymentName}: ${message}`);
      }
    }
  } catch (error) {
    logger.error("Failed to run verification.");
    logger.error(String(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  }
}

function extractFullyQualifiedName(metadata?: string): string | undefined {
  if (!metadata) return undefined;
  try {
    const parsed = JSON.parse(metadata) as { settings?: { compilationTarget?: Record<string, string> } };
    const target = parsed.settings?.compilationTarget;
    if (target) {
      const [[contractPath, contractName]] = Object.entries(target);
      return `${contractPath}:${contractName}`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const projectRoot = findProjectRoot();
    const metaPath = path.join(projectRoot, "artifacts-metadata.log");
    fs.appendFileSync(metaPath, `${message}
`);
  }
  return undefined;
}

void main();

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
