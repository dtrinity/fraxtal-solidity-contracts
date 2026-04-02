import "dotenv/config";
import path from "path";
import { promises as fs } from "fs";
import {
  TenderlyTraceResult,
  traceTransaction
} from "../../typescript/tenderly/client";

const DEFAULT_TX_HASH = "0xd8ae4f2a66d059e73407eca6ba0ba5080f5003f5abbf29867345425276734a32";
const DEFAULT_NETWORK = "fraxtal";
const TRACE_DIR = path.join("reports", "tenderly");

async function main(): Promise<void> {
  const txHash = process.env.TENDERLY_TX_HASH ?? DEFAULT_TX_HASH;
  const network = process.env.TENDERLY_NETWORK ?? DEFAULT_NETWORK;
  const accessKey = process.env.TENDERLY_ACCESS_KEY;

  if (!accessKey) {
    throw new Error("TENDERLY_ACCESS_KEY environment variable must be set");
  }

  const projectSlug = process.env.TENDERLY_PROJECT_SLUG ?? "project";
  const outputFile = path.join(
    TRACE_DIR,
    `raw-tenderly-trace-${network}-${txHash.slice(2, 10)}.json`
  );

  console.log(`Fetching Tenderly trace for transaction: ${txHash}`);
  console.log(`Network: ${network}`);
  console.log(`Project: ${projectSlug}`);

  const trace: TenderlyTraceResult = await traceTransaction({
    txHash,
    network,
    accessKey,
    projectSlug
  });

  await fs.mkdir(TRACE_DIR, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify(trace, null, 2));

  console.log(`\nSuccessfully fetched and saved trace to: ${outputFile}`);
  console.log(`Logs count: ${trace.logs?.length ?? 0}`);
  console.log(`Top-level calls: ${trace.trace?.length ?? 0}`);
}

main().catch((err) => {
  console.error("Error fetching Tenderly trace:", err);
  process.exitCode = 1;
});
