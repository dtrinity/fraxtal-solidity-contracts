import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { Interface, Log, formatUnits } from "ethers";
import { ethers } from "hardhat";
import {
  deployFraxtalOdosV1ExploitFixture,
  createMaliciousSwapData,
  createLiquiditySwapParams,
  createEmptyPermitInput,
  DUSD_DECIMALS,
  SFRXETH_DECIMALS,
  SUSDE_DECIMALS,
  FLASH_MINT_AMOUNT,
  VICTIM_1_COLLATERAL_TO_SWAP,
  VICTIM_1_DUST_OUTPUT,
  VICTIM_2_COLLATERAL_TO_SWAP,
  VICTIM_2_DUST_OUTPUT,
  VICTIM_3_COLLATERAL_TO_SWAP,
  VICTIM_3_DUST_OUTPUT,
} from "../../test/lending/adapters/odos/v1/fixtures/setup";
import {
  VICTIM_1_DUSD,
  VICTIM_2_SFRXETH,
  VICTIM_3_SUSDE,
} from "../../test/lending/adapters/odos/v1/helpers/attackConstants";
import {
  TenderlyTraceResult,
  TenderlyTransferEvent,
  extractTenderlyTransferEvents,
  summarizeCallTrace,
  traceTransaction,
} from "../../typescript/tenderly/client";

const PRODUCTION_COLLATERAL = {
  dUSD: {
    collateral: "0x788d96f655735f52c676a133f4dfc53cec614d4a",
    symbol: "dUSD",
    decimals: DUSD_DECIMALS,
  },
  sfrxETH: {
    collateral: "0xfc00000000000000000000000000000000000005",
    symbol: "sfrxETH",
    decimals: SFRXETH_DECIMALS,
  },
  sUSDe: {
    collateral: "0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2",
    symbol: "sUSDe",
    decimals: SUSDE_DECIMALS,
  },
} as const;

interface LocalTransferEvent {
  readonly token: string;
  readonly from: string;
  readonly to: string;
  readonly value: bigint;
  readonly decodedVia: "local";
}

interface LocalEventSummary {
  readonly address: string;
  readonly event: string;
  readonly args: Record<string, string>;
}

interface TokenMetadata {
  readonly symbol?: string;
  readonly decimals: number;
}

interface VictimComparison {
  readonly victimNumber: number;
  readonly victimName: string;
  readonly localCollateralToken: string;
  readonly productionCollateralToken: string;
  readonly collateralSymbol: string;
  readonly decimals: number;
  readonly actual: {
    readonly collateralPulled: bigint;
    readonly dustReturned: bigint;
    readonly aTokenBurned: bigint;
  };
  readonly reproduced: {
    readonly collateralPulled: bigint;
    readonly dustReturned: bigint;
    readonly aTokenBurned: bigint;
  };
  readonly matches: {
    readonly collateralPulled: boolean;
    readonly dustReturned: boolean;
    readonly aTokenBurned: boolean;
  };
}

interface ComparisonOutput {
  readonly metadata: {
    readonly generatedAt: string;
    readonly txHash: string;
    readonly network: string;
    readonly harnessTxHash: string;
  };
  readonly actual: {
    readonly transfers: TenderlyTransferEvent[];
    readonly callTraceExcerpt: string;
    readonly error?: string;
    readonly usedCache?: boolean;
  };
  readonly local: {
    readonly transfers: LocalTransferEvent[];
    readonly customEvents: LocalEventSummary[];
  };
  readonly comparison: {
    readonly victims: VictimComparison[];
    readonly flashMint: {
      readonly actual: bigint;
      readonly reproduced: bigint;
      readonly matches: boolean;
    };
    readonly alignmentScore: number;
    readonly discrepancies: string[];
  };
}

const OUTPUT_DIR = path.join("reports", "tenderly");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "attack-vs-repro-comparison-fraxtal.json");
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const transferIface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Environment variable ${name} must be set`);
  }
  return value;
}

function extractLocalTransferEvents(logs: readonly Log[]): LocalTransferEvent[] {
  const transfers: LocalTransferEvent[] = [];

  for (const log of logs) {
    if (!log.topics || log.topics.length === 0) {
      continue;
    }
    if (log.topics[0].toLowerCase() !== TRANSFER_TOPIC) {
      continue;
    }

    const parsed = transferIface.parseLog({ data: log.data, topics: log.topics });
    transfers.push({
      token: log.address,
      from: parsed.args[0] as string,
      to: parsed.args[1] as string,
      value: BigInt(parsed.args[2].toString()),
      decodedVia: "local",
    });
  }

  return transfers;
}

function aggregateByToken(
  transfers: readonly { token: string; value: bigint }[]
): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const transfer of transfers) {
    const current = totals.get(transfer.token) ?? 0n;
    totals.set(transfer.token, current + transfer.value);
  }
  return totals;
}

function aggregateNetFlows(
  transfers: readonly { token: string; from: string; to: string; value: bigint }[]
): Map<string, Map<string, bigint>> {
  const perToken = new Map<string, Map<string, bigint>>();

  for (const transfer of transfers) {
    const tokenMap = perToken.get(transfer.token) ?? new Map<string, bigint>();

    const fromBalance = tokenMap.get(transfer.from) ?? 0n;
    tokenMap.set(transfer.from, fromBalance - transfer.value);

    const toBalance = tokenMap.get(transfer.to) ?? 0n;
    tokenMap.set(transfer.to, toBalance + transfer.value);

    perToken.set(transfer.token, tokenMap);
  }

  return perToken;
}

function bigIntAbs(value: bigint): bigint {
  return value >= 0n ? value : -value;
}

function computeTolerance(amount: bigint): bigint {
  if (amount <= 0n) {
    return 0n;
  }
  const tolerance = amount / 200n; // 0.5%
  return tolerance > 0n ? tolerance : 1n;
}

function findClosestTransferByToken<T extends { token: string; value: bigint }>(
  transfers: readonly T[],
  token: string,
  target: bigint,
  tolerance: bigint
): T | undefined {
  const lowered = token.toLowerCase();
  let best: T | undefined;
  let bestDiff: bigint | undefined;

  for (const transfer of transfers) {
    if (transfer.token.toLowerCase() !== lowered) {
      continue;
    }
    const diff = bigIntAbs(transfer.value - target);
    if (tolerance === 0n && diff !== 0n) {
      continue;
    }
    if (tolerance > 0n && diff > tolerance) {
      continue;
    }
    if (bestDiff === undefined || diff < bestDiff) {
      best = transfer;
      bestDiff = diff;
    }
  }

  return best;
}

function tokenLabel(token: string, metadata?: Map<string, TokenMetadata>): string {
  const meta = metadata?.get(token);
  if (!meta) {
    return token;
  }
  if (meta.symbol && meta.symbol.length > 0) {
    return `${meta.symbol} (${token})`;
  }
  return token;
}

function formatTokenAmount(
  token: string,
  amount: bigint,
  metadata?: Map<string, TokenMetadata>
): string {
  const meta = metadata?.get(token);
  const decimals = meta?.decimals ?? 18;
  return formatUnits(amount, decimals);
}

function logTokenSummary(
  label: string,
  transfers: readonly { token: string; value: bigint }[],
  metadata?: Map<string, TokenMetadata>
): void {
  console.log(`\n${label}`);
  const totals = aggregateByToken(transfers);
  for (const [token, total] of totals.entries()) {
    const formatted = formatTokenAmount(token, total, metadata);
    console.log(
      `  Token ${tokenLabel(token, metadata)} total moved: ${formatted} (raw: ${total.toString()})`
    );
  }
}

function logNetFlows(
  label: string,
  transfers: readonly { token: string; from: string; to: string; value: bigint }[],
  metadata?: Map<string, TokenMetadata>
): void {
  console.log(`\n${label}`);
  const perToken = aggregateNetFlows(transfers);
  for (const [token, flows] of perToken.entries()) {
    console.log(`  Token ${tokenLabel(token, metadata)}`);
    for (const [account, delta] of flows.entries()) {
      if (delta === 0n) {
        continue;
      }
      const direction = delta > 0n ? "received" : "sent";
      const absolute = delta > 0n ? delta : -delta;
      const formatted = formatTokenAmount(token, absolute, metadata);
      console.log(`    ${account} ${direction}: ${formatted} (raw: ${delta.toString()})`);
    }
  }
}

function stringifyBigInts<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => (typeof val === "bigint" ? val.toString() : val))
  );
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatLogValue(item)).join(",");
  }
  if (value && typeof value === "object") {
    if ("toString" in value && typeof value.toString === "function") {
      const str = value.toString();
      if (str !== "[object Object]") {
        return str;
      }
    }
    return JSON.stringify(value);
  }
  return String(value);
}

async function fetchTenderlyTrace(
  txHash: string,
  network: string,
  accessKey: string,
  projectSlug?: string
): Promise<TenderlyTraceResult> {
  console.log(`Fetching Tenderly trace for ${txHash} on ${network}...`);
  const result = await traceTransaction({ txHash, network, accessKey, projectSlug });
  console.log(`Fetched ${result.logs?.length ?? 0} logs and ${result.trace?.length ?? 0} top-level calls.`);
  return result;
}

async function runLocalRepro(): Promise<{
  transfers: LocalTransferEvent[];
  customEvents: LocalEventSummary[];
  txHash: string;
  tokenAddresses: {
    dusd: string;
    sfrxeth: string;
    susde: string;
    aDusd: string;
    aSfrxeth: string;
    aSusde: string;
    attackExecutor: string;
    router: string;
  };
}> {
  const fixture = await deployFraxtalOdosV1ExploitFixture();
  const {
    victim1,
    victim2,
    victim3,
    attacker,
    pool,
    router,
    attackExecutor,
    adapter,
    dusd,
    sfrxeth,
    susde,
    aDusd,
    aSfrxeth,
    aSusde,
  } = fixture;

  const swapData = createMaliciousSwapData(router);

  // Approve adapter to spend all three victims' aTokens
  await aDusd.connect(victim1).approve(await adapter.getAddress(), VICTIM_1_COLLATERAL_TO_SWAP);
  await aSfrxeth
    .connect(victim2)
    .approve(await adapter.getAddress(), VICTIM_2_COLLATERAL_TO_SWAP);
  await aSusde.connect(victim3).approve(await adapter.getAddress(), VICTIM_3_COLLATERAL_TO_SWAP);

  // Create swap params for each victim
  const swapParams1 = createLiquiditySwapParams(
    await dusd.getAddress(),
    VICTIM_1_COLLATERAL_TO_SWAP,
    await dusd.getAddress(),
    VICTIM_1_DUST_OUTPUT,
    victim1.address,
    true,
    swapData
  );

  const swapParams2 = createLiquiditySwapParams(
    await sfrxeth.getAddress(),
    VICTIM_2_COLLATERAL_TO_SWAP,
    await sfrxeth.getAddress(),
    VICTIM_2_DUST_OUTPUT,
    victim2.address,
    true,
    swapData
  );

  const swapParams3 = createLiquiditySwapParams(
    await susde.getAddress(),
    VICTIM_3_COLLATERAL_TO_SWAP,
    await susde.getAddress(),
    VICTIM_3_DUST_OUTPUT,
    victim3.address,
    true,
    swapData
  );

  const permitInputs = [
    createEmptyPermitInput(await aDusd.getAddress()),
    createEmptyPermitInput(await aSfrxeth.getAddress()),
    createEmptyPermitInput(await aSusde.getAddress()),
  ];

  const tx = await attackExecutor
    .connect(attacker)
    .executeThreeVictimAttack([swapParams1, swapParams2, swapParams3], permitInputs);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("Missing transaction receipt for local repro");
  }

  const transfers = extractLocalTransferEvents(receipt.logs);
  const routerAddress = await router.getAddress();
  const executorAddress = await attackExecutor.getAddress();

  const customEvents: LocalEventSummary[] = [];
  for (const log of receipt.logs) {
    if (log.address === routerAddress) {
      try {
        const parsed = router.interface.parseLog(log);
        const namedArgs: Record<string, string> = {};
        for (let i = 0; i < parsed.fragment.inputs.length; i += 1) {
          const input = parsed.fragment.inputs[i];
          const key = input?.name && input.name.length > 0 ? input.name : `arg${i}`;
          namedArgs[key] = formatLogValue(parsed.args[i]);
        }
        customEvents.push({
          address: routerAddress,
          event: parsed.name,
          args: namedArgs,
        });
      } catch (err) {
        console.warn("Failed to parse router log", err);
      }
    }
    if (log.address === executorAddress) {
      try {
        const parsed = attackExecutor.interface.parseLog(log);
        const namedArgs: Record<string, string> = {};
        for (let i = 0; i < parsed.fragment.inputs.length; i += 1) {
          const input = parsed.fragment.inputs[i];
          const key = input?.name && input.name.length > 0 ? input.name : `arg${i}`;
          namedArgs[key] = formatLogValue(parsed.args[i]);
        }
        customEvents.push({
          address: executorAddress,
          event: parsed.name,
          args: namedArgs,
        });
      } catch (err) {
        console.warn("Failed to parse executor log", err);
      }
    }
  }

  return {
    transfers,
    customEvents,
    txHash: receipt.hash,
    tokenAddresses: {
      dusd: await dusd.getAddress(),
      sfrxeth: await sfrxeth.getAddress(),
      susde: await susde.getAddress(),
      aDusd: await aDusd.getAddress(),
      aSfrxeth: await aSfrxeth.getAddress(),
      aSusde: await aSusde.getAddress(),
      attackExecutor: executorAddress,
      router: routerAddress,
    },
  };
}

function compareVictimEvents(
  victimNumber: number,
  victimName: string,
  localCollateralToken: string,
  productionCollateralToken: string,
  collateralSymbol: string,
  decimals: number,
  expectedCollateral: bigint,
  expectedDust: bigint,
  actualTransfers: TenderlyTransferEvent[],
  localTransfers: LocalTransferEvent[]
): VictimComparison {
  const collateralTolerance = computeTolerance(expectedCollateral);
  const dustTolerance = expectedDust === 0n ? 0n : computeTolerance(expectedDust);

  const actualCollateral = findClosestTransferByToken(
    actualTransfers,
    productionCollateralToken,
    expectedCollateral,
    collateralTolerance
  );
  const actualDust = findClosestTransferByToken(
    actualTransfers,
    productionCollateralToken,
    expectedDust,
    dustTolerance
  );

  const localCollateral = localTransfers.find(
    (t) => t.token.toLowerCase() === localCollateralToken.toLowerCase() && t.value === expectedCollateral
  );
  const localDust = localTransfers.find(
    (t) => t.token.toLowerCase() === localCollateralToken.toLowerCase() && t.value === expectedDust
  );

  const actualCollateralValue = actualCollateral?.value ?? 0n;
  const actualDustValue = actualDust?.value ?? 0n;
  const reproducedCollateralValue = localCollateral?.value ?? expectedCollateral;
  const reproducedDustValue = localDust?.value ?? expectedDust;

  return {
    victimNumber,
    victimName,
    localCollateralToken,
    productionCollateralToken,
    collateralSymbol,
    decimals,
    actual: {
      collateralPulled: actualCollateralValue,
      dustReturned: actualDustValue,
      aTokenBurned: actualCollateralValue > actualDustValue
        ? actualCollateralValue - actualDustValue
        : 0n,
    },
    reproduced: {
      collateralPulled: reproducedCollateralValue,
      dustReturned: reproducedDustValue,
      aTokenBurned: reproducedCollateralValue > reproducedDustValue
        ? reproducedCollateralValue - reproducedDustValue
        : 0n,
    },
    matches: {
      collateralPulled: actualCollateral !== undefined,
      dustReturned: actualDust !== undefined,
      aTokenBurned: actualCollateral !== undefined,
    },
  };
}

function calculateAlignmentScore(
  victimComparisons: VictimComparison[],
  flashMintMatches: boolean
): number {
  let totalChecks = 0;
  let matchingChecks = 0;

  for (const victim of victimComparisons) {
    totalChecks += 3; // collateral, dust, aToken
    if (victim.matches.collateralPulled) matchingChecks++;
    if (victim.matches.dustReturned) matchingChecks++;
    if (victim.matches.aTokenBurned) matchingChecks++;
  }

  totalChecks += 1; // flash mint
  if (flashMintMatches) matchingChecks++;

  return Math.round((matchingChecks / totalChecks) * 100);
}

function findDiscrepancies(victimComparisons: VictimComparison[]): string[] {
  const discrepancies: string[] = [];

  for (const victim of victimComparisons) {
    if (!victim.matches.collateralPulled) {
      discrepancies.push(
        `${victim.victimName}: Collateral pulled mismatch (expected: ${formatUnits(
          victim.reproduced.collateralPulled,
          victim.decimals
        )}, actual: ${formatUnits(victim.actual.collateralPulled, victim.decimals)})`
      );
    }
    if (!victim.matches.dustReturned) {
      discrepancies.push(
        `${victim.victimName}: Dust returned mismatch (expected: ${formatUnits(
          victim.reproduced.dustReturned,
          victim.decimals
        )}, actual: ${formatUnits(victim.actual.dustReturned, victim.decimals)})`
      );
    }
    if (!victim.matches.aTokenBurned) {
      discrepancies.push(
        `${victim.victimName}: aToken burn mismatch (expected: ${formatUnits(
          victim.reproduced.aTokenBurned,
          victim.decimals
        )}, actual: ${formatUnits(victim.actual.aTokenBurned, victim.decimals)})`
      );
    }
  }

  return discrepancies;
}

async function main(): Promise<void> {
  const txHash = requireEnv(
    "TENDERLY_TX_HASH",
    "0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32"
  );
  const network = requireEnv("TENDERLY_NETWORK", "fraxtal");
  const accessKey = process.env.TENDERLY_ACCESS_KEY;
  const projectSlug = process.env.TENDERLY_PROJECT_SLUG ?? "project";
  const cacheAllowed = process.env.TENDERLY_FORCE_REFRESH !== "true";
  const traceCacheFile = path.join(OUTPUT_DIR, `raw-tenderly-trace-${network}-${txHash.slice(2, 10)}.json`);

  let tenderlyTrace: TenderlyTraceResult | null = null;
  let tenderlyError: string | undefined;
  let usedCache = false;

  if (cacheAllowed) {
    try {
      const cached = await fs.readFile(traceCacheFile, "utf8");
      tenderlyTrace = JSON.parse(cached) as TenderlyTraceResult;
      usedCache = true;
      console.log(`Loaded Tenderly trace from cache ${traceCacheFile}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Cache miss (${message}), will request fresh trace.`);
    }
  }

  if (!tenderlyTrace) {
    if (!accessKey) {
      throw new Error(
        "No cached Tenderly trace found. Set TENDERLY_ACCESS_KEY (or provide a cached trace) to fetch from Tenderly."
      );
    }
    try {
      tenderlyTrace = await fetchTenderlyTrace(txHash, network, accessKey, projectSlug);
      await ensureOutputDir();
      await fs.writeFile(traceCacheFile, JSON.stringify(tenderlyTrace, null, 2));
      console.log(`Cached Tenderly trace to ${traceCacheFile}`);
    } catch (err) {
      tenderlyError = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch Tenderly trace: ${tenderlyError}`);

      if (cacheAllowed) {
        try {
          const cached = await fs.readFile(traceCacheFile, "utf8");
          tenderlyTrace = JSON.parse(cached) as TenderlyTraceResult;
          usedCache = true;
          console.log(`Recovered Tenderly trace from cache ${traceCacheFile}`);
          tenderlyError = `${tenderlyError} (used cached copy)`;
        } catch (cacheErr) {
          const cacheMsg = cacheErr instanceof Error ? cacheErr.message : String(cacheErr);
          console.error(`Failed to recover cache: ${cacheMsg}`);
        }
      }
    }
  }

  const actualTransfers = tenderlyTrace ? extractTenderlyTransferEvents(tenderlyTrace) : [];
  const callTraceExcerpt = tenderlyTrace?.trace
    ? summarizeCallTrace(tenderlyTrace.trace.slice(0, 4))
    : "";
  const tokenMetadata = new Map<string, TokenMetadata>();
  if (tenderlyTrace?.assetChanges) {
    for (const change of tenderlyTrace.assetChanges) {
      const address = change?.assetInfo?.contractAddress;
      if (!address) {
        continue;
      }
      const decimals = Number(change.assetInfo?.decimals ?? 18);
      const symbol = change.assetInfo?.symbol ?? undefined;
      if (!tokenMetadata.has(address)) {
        tokenMetadata.set(address, {
          symbol,
          decimals: Number.isNaN(decimals) ? 18 : decimals,
        });
      }
    }
  }

  tokenMetadata.set(PRODUCTION_COLLATERAL.dUSD.collateral.toLowerCase(), {
    symbol: PRODUCTION_COLLATERAL.dUSD.symbol,
    decimals: PRODUCTION_COLLATERAL.dUSD.decimals,
  });
  tokenMetadata.set(PRODUCTION_COLLATERAL.sfrxETH.collateral.toLowerCase(), {
    symbol: PRODUCTION_COLLATERAL.sfrxETH.symbol,
    decimals: PRODUCTION_COLLATERAL.sfrxETH.decimals,
  });
  tokenMetadata.set(PRODUCTION_COLLATERAL.sUSDe.collateral.toLowerCase(), {
    symbol: PRODUCTION_COLLATERAL.sUSDe.symbol,
    decimals: PRODUCTION_COLLATERAL.sUSDe.decimals,
  });

  const { transfers: localTransfers, customEvents, txHash: localTxHash, tokenAddresses } = await runLocalRepro();

  const localTokenMetadata = new Map<string, TokenMetadata>();
  localTokenMetadata.set(tokenAddresses.dusd, { symbol: "dUSD", decimals: DUSD_DECIMALS });
  localTokenMetadata.set(tokenAddresses.sfrxeth, { symbol: "sfrxETH", decimals: SFRXETH_DECIMALS });
  localTokenMetadata.set(tokenAddresses.susde, { symbol: "sUSDe", decimals: SUSDE_DECIMALS });

  // Compare victims
  const victim1Comparison = compareVictimEvents(
    1,
    "Victim 1 (dUSD)",
    tokenAddresses.dusd,
    PRODUCTION_COLLATERAL.dUSD.collateral,
    "dUSD",
    DUSD_DECIMALS,
    VICTIM_1_DUSD.COLLATERAL_TO_SWAP,
    VICTIM_1_DUSD.DUST_OUTPUT,
    actualTransfers,
    localTransfers
  );

  const victim2Comparison = compareVictimEvents(
    2,
    "Victim 2 (sfrxETH)",
    tokenAddresses.sfrxeth,
    PRODUCTION_COLLATERAL.sfrxETH.collateral,
    "sfrxETH",
    SFRXETH_DECIMALS,
    VICTIM_2_SFRXETH.COLLATERAL_TO_SWAP,
    VICTIM_2_SFRXETH.DUST_OUTPUT,
    actualTransfers,
    localTransfers
  );

  const victim3Comparison = compareVictimEvents(
    3,
    "Victim 3 (sUSDe)",
    tokenAddresses.susde,
    PRODUCTION_COLLATERAL.sUSDe.collateral,
    "sUSDe",
    SUSDE_DECIMALS,
    VICTIM_3_SUSDE.COLLATERAL_TO_SWAP,
    VICTIM_3_SUSDE.DUST_OUTPUT,
    actualTransfers,
    localTransfers
  );

  // Compare flash mint
  const flashMintActual = actualTransfers.find(
    (t) => t.value === FLASH_MINT_AMOUNT || Math.abs(Number(t.value - FLASH_MINT_AMOUNT)) < 1000
  );
  const flashMintLocal = localTransfers.find((t) => t.value === FLASH_MINT_AMOUNT);

  const flashMintComparison = {
    actual: flashMintActual?.value ?? 0n,
    reproduced: flashMintLocal?.value ?? FLASH_MINT_AMOUNT,
    matches: flashMintActual !== undefined,
  };

  const victimComparisons = [victim1Comparison, victim2Comparison, victim3Comparison];
  const alignmentScore = calculateAlignmentScore(victimComparisons, flashMintComparison.matches);
  const discrepancies = findDiscrepancies(victimComparisons);

  await ensureOutputDir();
  const payload: ComparisonOutput = {
    metadata: {
      generatedAt: new Date().toISOString(),
      txHash,
      network,
      harnessTxHash: localTxHash,
    },
    actual: {
      transfers: actualTransfers,
      callTraceExcerpt,
      error: tenderlyError,
      usedCache,
    },
    local: {
      transfers: localTransfers,
      customEvents,
    },
    comparison: {
      victims: victimComparisons,
      flashMint: flashMintComparison,
      alignmentScore,
      discrepancies,
    },
  };

  const serialised = JSON.stringify(stringifyBigInts(payload), null, 2);
  await fs.writeFile(OUTPUT_FILE, `${serialised}\n`);

  console.log(`\nWrote comparison artifact to ${OUTPUT_FILE}`);
  console.log(`\n=== Three-Victim Attack Comparison ===`);
  console.log(`Alignment Score: ${alignmentScore}%`);
  console.log(`\nVictim 1 (dUSD):`);
  console.log(`  Collateral: ${formatUnits(victim1Comparison.reproduced.collateralPulled, DUSD_DECIMALS)} dUSD`);
  console.log(`  Dust: ${formatUnits(victim1Comparison.reproduced.dustReturned, DUSD_DECIMALS)} dUSD`);
  console.log(`  Match: ${victim1Comparison.matches.collateralPulled ? "✓" : "✗"}`);

  console.log(`\nVictim 2 (sfrxETH):`);
  console.log(`  Collateral: ${formatUnits(victim2Comparison.reproduced.collateralPulled, SFRXETH_DECIMALS)} sfrxETH`);
  console.log(`  Dust: ${formatUnits(victim2Comparison.reproduced.dustReturned, SFRXETH_DECIMALS)} sfrxETH`);
  console.log(`  Match: ${victim2Comparison.matches.collateralPulled ? "✓" : "✗"}`);

  console.log(`\nVictim 3 (sUSDe):`);
  console.log(`  Collateral: ${formatUnits(victim3Comparison.reproduced.collateralPulled, SUSDE_DECIMALS)} sUSDe`);
  console.log(`  Dust: ${formatUnits(victim3Comparison.reproduced.dustReturned, SUSDE_DECIMALS)} sUSDe`);
  console.log(`  Match: ${victim3Comparison.matches.collateralPulled ? "✓" : "✗"}`);

  console.log(`\nFlash Mint:`);
  console.log(`  Amount: ${formatUnits(FLASH_MINT_AMOUNT, DUSD_DECIMALS)} dUSD`);
  console.log(`  Match: ${flashMintComparison.matches ? "✓" : "✗"}`);

  if (discrepancies.length > 0) {
    console.log(`\nDiscrepancies Found:`);
    for (const discrepancy of discrepancies) {
      console.log(`  - ${discrepancy}`);
    }
  } else {
    console.log(`\nNo discrepancies found - reproduction matches actual attack perfectly!`);
  }

  logTokenSummary("Actual attack transfer totals", actualTransfers, tokenMetadata);
  logNetFlows("Actual attack net flows per account", actualTransfers, tokenMetadata);
  logTokenSummary("Local repro transfer totals", localTransfers, localTokenMetadata);
  logNetFlows("Local repro net flows per account", localTransfers, localTokenMetadata);

  console.log(`\n========================================\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
