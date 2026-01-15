#!/usr/bin/env ts-node

import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { spawn } from 'child_process';
import readline from 'readline';

import { Command } from 'commander';
import { glob } from 'glob';

import { logger } from '../../lib/logger';
import { findProjectRoot, getNetworkName } from '../../lib/utils';

type CliOptions = {
  network: string;
  projectRoot: string;
  deploymentsRoot: string;
  apiUrl: string;
  browserUrl: string;
  apiKey?: string;
  chainId?: number;
  apiVersion: 'v1' | 'v2';
  delayMs: number;
  force: boolean;
  prompt: boolean;
  verify: boolean;
  outDir: string;
};

type DeploymentInfo = {
  name: string;
  address: string;
  args: unknown[];
  sourceFile: string;
  contractPath?: string;
  contractName?: string;
  fullyQualifiedName?: string;
};

type VerificationStatus = 'verified' | 'unverified' | 'error';

type VerificationResult = {
  deployment: DeploymentInfo;
  status: VerificationStatus;
  explorerUrl: string;
  apiContractName?: string;
  isProxy?: boolean;
  implementation?: string;
  errorMessage?: string;
  cached?: boolean;
  checkedAt?: string;
};

type EtherscanResponse = {
  status?: string;
  message?: string;
  result?: unknown;
};

type CachedVerificationEntry = {
  status: VerificationStatus;
  apiContractName?: string;
  isProxy?: boolean;
  implementation?: string;
  errorMessage?: string;
  checkedAt: string;
};

type VerificationCacheFile = {
  version: number;
  network: string;
  apiUrl: string;
  chainId?: number;
  entries: Record<string, CachedVerificationEntry>;
};

const KNOWN_NETWORKS: Record<string, { apiUrl: string; browserUrl: string; chainId: number }> = {
  mainnet: {
    apiUrl: 'https://api.etherscan.io/v2/api',
    browserUrl: 'https://etherscan.io',
    chainId: 1
  },
  ethereum_mainnet: {
    apiUrl: 'https://api.etherscan.io/v2/api',
    browserUrl: 'https://etherscan.io',
    chainId: 1
  },
  sepolia: {
    apiUrl: 'https://api.etherscan.io/v2/api',
    browserUrl: 'https://sepolia.etherscan.io',
    chainId: 11155111
  },
  ethereum_testnet: {
    apiUrl: 'https://api.etherscan.io/v2/api',
    browserUrl: 'https://sepolia.etherscan.io',
    chainId: 11155111
  }
};

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function parseMetadata(metadataRaw?: string): {
  contractPath?: string;
  contractName?: string;
  fullyQualifiedName?: string;
} {
  if (!metadataRaw) {
    return {};
  }

  try {
    const metadata = JSON.parse(metadataRaw) as {
      settings?: { compilationTarget?: Record<string, string> };
    };
    const target = metadata?.settings?.compilationTarget;
    if (!target || typeof target !== 'object') {
      return {};
    }
    const entries = Object.entries(target);
    if (entries.length === 0) {
      return {};
    }
    const [contractPath, contractName] = entries[0];
    if (typeof contractPath !== 'string' || typeof contractName !== 'string') {
      return {};
    }
    return {
      contractPath,
      contractName,
      fullyQualifiedName: `${contractPath}:${contractName}`
    };
  } catch (error) {
    logger.warn(`Failed to parse metadata JSON: ${String((error as Error).message)}`);
    return {};
  }
}

function resolveNetworkConfig(
  network: string,
  apiUrl?: string,
  browserUrl?: string,
  chainId?: number
): { apiUrl: string; browserUrl: string; chainId?: number } | null {
  const known = KNOWN_NETWORKS[network];
  const resolvedApiUrl = apiUrl ?? known?.apiUrl;
  const resolvedBrowserUrl = browserUrl ?? known?.browserUrl;
  const resolvedChainId = chainId ?? known?.chainId;

  if (!resolvedApiUrl || !resolvedBrowserUrl) {
    logger.error('Unable to resolve explorer URLs. Provide --api-url and --browser-url.');
    return null;
  }

  return {
    apiUrl: resolvedApiUrl,
    browserUrl: resolvedBrowserUrl,
    chainId: resolvedChainId
  };
}

function resolveApiKey(explicit?: string): string | undefined {
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  return process.env.ETHERSCAN_API_KEY;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadDeployments(deploymentsDir: string): Promise<DeploymentInfo[]> {
  const pattern = path.join(deploymentsDir, '*.json');
  const files = await glob(pattern, { nodir: true });
  files.sort();

  const deployments: DeploymentInfo[] = [];
  for (const file of files) {
    try {
      const raw = await fs.promises.readFile(file, 'utf8');
      const data = JSON.parse(raw) as {
        address?: string;
        args?: unknown[];
        metadata?: string;
        contractName?: string;
      };
      if (typeof data?.address !== 'string' || data.address.trim().length === 0) {
        logger.warn(`Skipping deployment without address: ${file}`);
        continue;
      }
      const parsedMeta = parseMetadata(typeof data.metadata === 'string' ? data.metadata : undefined);
      deployments.push({
        name: path.basename(file, '.json'),
        address: data.address,
        args: Array.isArray(data.args) ? data.args : [],
        sourceFile: file,
        contractName: data.contractName ?? parsedMeta.contractName,
        contractPath: parsedMeta.contractPath,
        fullyQualifiedName: parsedMeta.fullyQualifiedName
      });
    } catch (error) {
      logger.warn(`Failed to read deployment file "${file}": ${String((error as Error).message)}`);
    }
  }

  return deployments;
}

async function fetchJson(url: string): Promise<{ statusCode: number; payload: unknown }> {
  const urlObj = new URL(url);
  const client = urlObj.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const request = client.get(
      urlObj,
      {
        headers: {
          'User-Agent': 'shared-hardhat-tools'
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += String(chunk);
        });
        res.on('end', () => {
          try {
            const payload = JSON.parse(data);
            resolve({ statusCode: res.statusCode ?? 0, payload });
          } catch (error) {
            reject(new Error(`Failed to parse JSON response: ${String((error as Error).message)}`));
          }
        });
      }
    );

    request.on('error', (error) => reject(error));
  });
}

async function fetchVerificationStatus(
  deployment: DeploymentInfo,
  apiUrl: string,
  apiVersion: 'v1' | 'v2',
  chainId: number | undefined,
  apiKey?: string
): Promise<VerificationResult> {
  const url = new URL(apiUrl);
  if (apiVersion === 'v2' && chainId) {
    url.searchParams.set('chainid', String(chainId));
  }
  url.searchParams.set('module', 'contract');
  url.searchParams.set('action', 'getsourcecode');
  url.searchParams.set('address', deployment.address);
  if (apiKey) {
    url.searchParams.set('apikey', apiKey);
  }

  try {
    const { statusCode, payload } = await fetchJson(url.toString());
    if (statusCode < 200 || statusCode >= 300) {
      return {
        deployment,
        status: 'error',
        explorerUrl: '',
        errorMessage: `HTTP ${statusCode} from explorer API`
      };
    }

    const response = payload as EtherscanResponse;
    if (response.status !== '1') {
      const message = typeof response.result === 'string'
        ? response.result
        : response.message ?? 'Explorer API error';
      return {
        deployment,
        status: 'error',
        explorerUrl: '',
        errorMessage: message
      };
    }

    const result = Array.isArray(response.result) ? response.result[0] : undefined;
    const sourceCode = typeof result?.SourceCode === 'string' ? result.SourceCode : '';
    const abi = typeof result?.ABI === 'string' ? result.ABI : '';
    const isVerified = (
      (sourceCode.trim().length > 0 && sourceCode !== 'Contract source code not verified')
      || (abi.trim().length > 0 && abi !== 'Contract source code not verified')
    );

    return {
      deployment,
      status: isVerified ? 'verified' : 'unverified',
      explorerUrl: '',
      apiContractName: typeof result?.ContractName === 'string' ? result.ContractName : undefined,
      isProxy: result?.Proxy === '1',
      implementation: typeof result?.Implementation === 'string' ? result.Implementation : undefined
    };
  } catch (error) {
    return {
      deployment,
      status: 'error',
      explorerUrl: '',
      errorMessage: String((error as Error).message)
    };
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatExplorerUrl(browserUrl: string, address: string): string {
  return `${browserUrl.replace(/\/$/, '')}/address/${address}#code`;
}

async function askYesNo(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

async function writeArgsFile(outDir: string, deployment: DeploymentInfo): Promise<string> {
  await fs.promises.mkdir(outDir, { recursive: true });
  const fileName = `${deployment.name}.args.js`;
  const fullPath = path.join(outDir, fileName);
  const content = `module.exports = ${JSON.stringify(deployment.args, null, 2)};
`;
  await fs.promises.writeFile(fullPath, content, 'utf8');
  return fullPath;
}

async function runHardhatVerify(
  options: CliOptions,
  deployment: DeploymentInfo,
  argsFile?: string
): Promise<boolean> {
  const args: string[] = ['hardhat', 'verify', '--network', options.network];
  if (deployment.fullyQualifiedName) {
    args.push('--contract', deployment.fullyQualifiedName);
  }
  args.push(deployment.address);
  if (argsFile) {
    args.push('--constructor-args', argsFile);
  }

  return new Promise((resolve) => {
    const env = { ...process.env };
    if (options.apiKey && options.apiKey.trim().length > 0) {
      env.ETHERSCAN_API_KEY = options.apiKey;
    }
    const child = spawn('npx', args, { stdio: 'inherit', env, cwd: options.projectRoot });
    child.on('close', (code) => resolve(code === 0));
  });
}

async function loadCache(
  cacheFile: string,
  options: CliOptions
): Promise<VerificationCacheFile | null> {
  try {
    const raw = await fs.promises.readFile(cacheFile, 'utf8');
    const data = JSON.parse(raw) as VerificationCacheFile;
    if (!data || typeof data !== 'object') {
      return null;
    }
    if (data.version !== 1) {
      return null;
    }
    if (data.network !== options.network) {
      return null;
    }
    if (data.apiUrl !== options.apiUrl) {
      return null;
    }
    if ((data.chainId ?? null) !== (options.chainId ?? null)) {
      return null;
    }
    if (!data.entries || typeof data.entries !== 'object') {
      return null;
    }
    return data;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return null;
    }
    logger.warn(`Failed to read cache file "${cacheFile}": ${String((error as Error).message)}`);
    return null;
  }
}

async function saveCache(
  cacheFile: string,
  options: CliOptions,
  results: VerificationResult[]
): Promise<void> {
  const entries: Record<string, CachedVerificationEntry> = {};
  const now = new Date().toISOString();
  for (const result of results) {
    entries[normalizeAddress(result.deployment.address)] = {
      status: result.status,
      apiContractName: result.apiContractName,
      isProxy: result.isProxy,
      implementation: result.implementation,
      errorMessage: result.errorMessage,
      checkedAt: result.checkedAt ?? now
    };
  }

  const payload: VerificationCacheFile = {
    version: 1,
    network: options.network,
    apiUrl: options.apiUrl,
    chainId: options.chainId,
    entries
  };

  await fs.promises.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.promises.writeFile(cacheFile, `${JSON.stringify(payload, null, 2)}
`, 'utf8');
}

function printVerificationDetails(results: VerificationResult[], options: CliOptions): void {
  if (results.length === 0) {
    return;
  }

  logger.info('Unverified or blocked contracts:');

  for (const result of results) {
    const deployment = result.deployment;
    console.log(`\n- ${deployment.name}`);
    console.log(`  Address: ${deployment.address}`);
    console.log(`  Explorer: ${result.explorerUrl}`);
    console.log(`  Contract: ${deployment.fullyQualifiedName ?? 'n/a'}`);
    if (deployment.args.length > 0) {
      console.log(`  Constructor args (${deployment.args.length}): ${JSON.stringify(deployment.args)}`);
    } else {
      console.log('  Constructor args: []');
    }
    if (result.cached && result.checkedAt) {
      console.log(`  Cached: yes (checked ${result.checkedAt})`);
    }
    if (result.apiContractName && result.apiContractName !== deployment.contractName) {
      console.log(`  Explorer reports: ${result.apiContractName}`);
    }
    if (result.isProxy) {
      console.log(`  Proxy: yes${result.implementation ? ` (impl ${result.implementation})` : ''}`);
    }
    if (result.errorMessage) {
      console.log(`  Check error: ${result.errorMessage}`);
    }
  }

  if (!options.verify) {
    logger.info('Suggested verification command template:');
    logger.info(
      '  npx hardhat verify --network <network> --contract <path:Contract> <address> --constructor-args <args-file>'
    );
  }
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .description('Check explorer verification status for deployments in a Hardhat project.')
    .option('-n, --network <name>', 'Deployment network to inspect (defaults to HARDHAT_NETWORK or NETWORK).')
    .option('--deployments-dir <path>', 'Deployments directory (defaults to ./deployments).')
    .option('--api-url <url>', 'Explorer API URL (defaults to Etherscan v2 for Ethereum).')
    .option('--browser-url <url>', 'Explorer browser URL (defaults to Etherscan for Ethereum).')
    .option('--api-key <key>', 'Explorer API key (defaults to ETHERSCAN_API_KEY env).')
    .option('--chain-id <id>', 'Chain ID for the explorer API (required for v2).')
    .option('--api-version <version>', 'Explorer API version: v1 or v2 (default: v2).', 'v2')
    .option('--delay-ms <ms>', 'Delay between API calls in milliseconds (default: 250).', '250')
    .option('--out-dir <path>', 'Directory for constructor-args + cache (default: .verify-args).')
    .option('--force', 'Ignore cached verification data and re-check explorer.')
    .option('--verify', 'Attempt verification without prompting.')
    .option('--no-prompt', 'Disable verification prompt.');

  program.parse(process.argv);
  const rawOptions = program.opts();

  const network = (rawOptions.network as string | undefined) ?? getNetworkName();
  if (!network) {
    logger.error('Network is required. Provide --network or set HARDHAT_NETWORK.');
    process.exitCode = 1;
    return;
  }

  const projectRoot = findProjectRoot();
  const deploymentsRoot = rawOptions.deploymentsDir
    ? path.resolve(projectRoot, rawOptions.deploymentsDir as string)
    : path.join(projectRoot, 'deployments');
  const deploymentsDir = path.join(deploymentsRoot, network);

  const apiVersion = (rawOptions.apiVersion as string).toLowerCase();
  if (apiVersion !== 'v1' && apiVersion !== 'v2') {
    logger.error(`Unsupported API version "${rawOptions.apiVersion}". Use "v1" or "v2".`);
    process.exitCode = 1;
    return;
  }

  const chainIdRaw = rawOptions.chainId as string | undefined;
  const chainId = chainIdRaw ? Number(chainIdRaw) : undefined;
  if (chainIdRaw && (!chainId || Number.isNaN(chainId))) {
    logger.error(`Invalid chain ID "${chainIdRaw}".`);
    process.exitCode = 1;
    return;
  }

  const networkConfig = resolveNetworkConfig(
    network,
    rawOptions.apiUrl as string | undefined,
    rawOptions.browserUrl as string | undefined,
    chainId
  );
  if (!networkConfig) {
    process.exitCode = 1;
    return;
  }

  if (apiVersion === 'v2' && !networkConfig.chainId) {
    logger.error('Explorer API v2 requires a chain ID. Provide --chain-id.');
    process.exitCode = 1;
    return;
  }

  const options: CliOptions = {
    network,
    projectRoot,
    deploymentsRoot,
    apiUrl: networkConfig.apiUrl,
    browserUrl: networkConfig.browserUrl,
    apiKey: resolveApiKey(rawOptions.apiKey as string | undefined),
    chainId: networkConfig.chainId,
    apiVersion,
    delayMs: parseNumber(rawOptions.delayMs as string | undefined, 250),
    force: Boolean(rawOptions.force),
    prompt: Boolean(rawOptions.prompt),
    verify: Boolean(rawOptions.verify),
    outDir: rawOptions.outDir
      ? path.resolve(projectRoot, rawOptions.outDir as string)
      : path.join(projectRoot, '.verify-args')
  };

  if (!options.apiKey) {
    logger.warn('ETHERSCAN_API_KEY is not set. Explorer API may reject requests.');
  }

  try {
    const stats = await fs.promises.stat(deploymentsDir);
    if (!stats.isDirectory()) {
      throw new Error('not a directory');
    }
  } catch (error) {
    logger.error(`Deployment directory not found: ${deploymentsDir}`);
    logger.error('Use --network to point at a valid Hardhat deployments folder.');
    process.exitCode = 1;
    return;
  }

  const deployments = await loadDeployments(deploymentsDir);
  if (deployments.length === 0) {
    logger.info('No deployments found to check.');
    return;
  }

  logger.info(
    `Checking ${deployments.length} deployment(s) on ${options.network} using ${options.apiUrl}...`
  );

  const cacheFile = path.join(options.outDir, 'verification-cache.json');
  const cache = options.force ? null : await loadCache(cacheFile, options);
  let cacheHits = 0;

  const results: VerificationResult[] = [];
  for (let i = 0; i < deployments.length; i += 1) {
    const deployment = deployments[i];
    logger.info(`[${i + 1}/${deployments.length}] ${deployment.name}`);
    const cachedEntry = cache?.entries[normalizeAddress(deployment.address)];
    let didFetch = false;
    let result: VerificationResult;
    if (cachedEntry) {
      cacheHits += 1;
      result = {
        deployment,
        status: cachedEntry.status,
        explorerUrl: '',
        apiContractName: cachedEntry.apiContractName,
        isProxy: cachedEntry.isProxy,
        implementation: cachedEntry.implementation,
        errorMessage: cachedEntry.errorMessage,
        cached: true,
        checkedAt: cachedEntry.checkedAt
      };
    } else {
      didFetch = true;
      result = await fetchVerificationStatus(
        deployment,
        options.apiUrl,
        options.apiVersion,
        options.chainId,
        options.apiKey
      );
      result.cached = false;
      result.checkedAt = new Date().toISOString();
    }
    result.explorerUrl = formatExplorerUrl(options.browserUrl, deployment.address);
    results.push(result);
    if (didFetch && i < deployments.length - 1) {
      await sleep(options.delayMs);
    }
  }

  const verified = results.filter((item) => item.status === 'verified');
  const unverified = results.filter((item) => item.status === 'unverified');
  const errors = results.filter((item) => item.status === 'error');
  const needsAttention = [...unverified, ...errors];

  logger.info('Verification summary:');
  logger.info(`  Verified: ${verified.length}`);
  logger.info(`  Unverified: ${unverified.length}`);
  logger.info(`  Errors: ${errors.length}`);
  if (cache) {
    logger.info(`  Cache hits: ${cacheHits}/${deployments.length} (use --force to refresh)`);
  }

  printVerificationDetails(needsAttention, options);

  if (needsAttention.length === 0) {
    await saveCache(cacheFile, options, results);
    return;
  }

  const shouldPrompt = options.prompt && process.stdin.isTTY && !options.verify;
  const shouldVerify = options.verify
    || (shouldPrompt && (await askYesNo('\nAttempt verification now? (y/N): ')));

  if (!shouldVerify) {
    await saveCache(cacheFile, options, results);
    return;
  }

  logger.info(`Writing constructor args to ${options.outDir}`);
  for (const result of needsAttention) {
    const deployment = result.deployment;
    const argsFile = await writeArgsFile(options.outDir, deployment);
    const ok = await runHardhatVerify(options, deployment, argsFile);
    if (!ok) {
      logger.warn(`Verification failed for ${deployment.name}.`);
      logger.warn(`  Address: ${deployment.address}`);
      logger.warn(`  Args file: ${argsFile}`);
    } else {
      result.status = 'verified';
      result.errorMessage = undefined;
      result.cached = false;
      result.checkedAt = new Date().toISOString();
    }
  }

  await saveCache(cacheFile, options, results);
}

void main().catch((error) => {
  logger.error('Unhandled error while checking verification.');
  logger.error(String(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
