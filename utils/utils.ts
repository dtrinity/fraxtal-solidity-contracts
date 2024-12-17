import { Contract } from "ethers";
import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { fetchTokenInfoFromAddress, TokenInfo } from "./token";

/**
 *  Get the current block timestamp
 *
 * @param hre - Hardhat Runtime Environment
 * @returns The current block timestamp
 */
export async function getCurrentBlockTimestamp(
  hre: HardhatRuntimeEnvironment,
): Promise<number> {
  const blockNumBefore = await hre.ethers.provider.getBlockNumber();
  const blockBefore = await hre.ethers.provider.getBlock(blockNumBefore);

  if (!blockBefore) {
    throw new Error("Block not found");
  }
  return blockBefore.timestamp;
}

/**
 * Check if the network is local
 *
 * @param network - The network name
 * @returns True if the network is local, false otherwise
 */
export function isLocalNetwork(network: string): boolean {
  return (
    network === "localhost" ||
    network === "hardhat" ||
    network === "local_ethereum"
  );
}

/**
 * Check if the network is testnet
 *
 * @param network - The network name
 * @returns True if the network is testnet, false otherwise
 */
export function isTestnetNetwork(network: string): boolean {
  return network.endsWith("_testnet");
}

export class ShortTermIgnoreMemory {
  private memory: Map<string, number>;
  private ignoreDuration: number;
  private stateDirPath: string | undefined;
  private isInitialized: boolean;
  private memoryFilePath: string;

  constructor(ignoreDurationInSeconds: number, stateDirPath?: string) {
    this.memory = new Map<string, number>();
    this.ignoreDuration = ignoreDurationInSeconds * 1000; // Convert to milliseconds

    // If the state directory is not set, then we do not need to save to file
    this.stateDirPath = stateDirPath;
    this.isInitialized = false;
    this.memoryFilePath = `${this.stateDirPath}/ignoreMemory.json`;
  }

  put(value: string): void {
    this.initializeIfNeeded();

    const expiryTime = Date.now() + this.ignoreDuration;
    this.memory.set(value, expiryTime);

    // As the value is added, we need to dump to file
    this.dumpToFileIfNeeded();
  }

  isIgnored(value: string): boolean {
    this.initializeIfNeeded();

    const expiryTime = this.memory.get(value);

    if (!expiryTime) {
      return false;
    }

    if (Date.now() < expiryTime) {
      return true;
    }
    this.memory.delete(value);

    // As the value is removed, we need to dump to file
    this.dumpToFileIfNeeded();

    return false;
  }

  initializeIfNeeded(): void {
    if (this.isInitialized) {
      return;
    }

    if (!this.stateDirPath) {
      this.isInitialized = true;
      return;
    }

    console.log(`Loading ignore memory from ${this.memoryFilePath}`);

    // Create the state directory if it does not exist
    const fs = require("fs");

    if (!fs.existsSync(this.stateDirPath)) {
      fs.mkdirSync(this.stateDirPath, { recursive: true });
    }

    // Load the ignore memory from file
    if (fs.existsSync(this.memoryFilePath)) {
      const data = fs.readFileSync(this.memoryFilePath, "utf8");
      const jsonData = JSON.parse(data);

      if (!jsonData) {
        throw new Error(`Invalid JSON data at ${this.memoryFilePath}`);
      }

      if (jsonData.ignoreDuration !== this.ignoreDuration) {
        throw new Error(
          `The ignore duration in the file ${this.memoryFilePath} does not match the current duration`,
        );
      }

      if (!jsonData.memory) {
        throw new Error(`Invalid memory data at ${this.memoryFilePath}`);
      }

      this.ignoreDuration = jsonData.ignoreDuration;

      // Convert the memory data to Map
      this.memory = new Map<string, number>(Object.entries(jsonData.memory));
    }

    console.log(`Loaded ignore memory with ${this.memory.size} entries`);

    this.isInitialized = true;
  }

  dumpToFileIfNeeded(): void {
    this.initializeIfNeeded();

    // Only dump to file if the state directory is set
    if (!this.stateDirPath) {
      return;
    }

    const data = {
      ignoreDuration: this.ignoreDuration,
      memory: Object.fromEntries(this.memory),
    };

    // Save to JSON file with pretty print
    saveToFile(this.memoryFilePath, JSON.stringify(data, null, 2));
  }
}

/**
 * Run the Promise.all in batches
 *
 * @param promises - Array of promises
 * @param batchSize - Batch size
 * @returns - Array of results
 */
export async function batchedPromiseAll<T>(
  promises: Promise<T>[],
  batchSize: number,
): Promise<T[]> {
  let result: T[] = [];

  for (let i = 0; i < promises.length; i += batchSize) {
    const batch = promises.slice(i, i + batchSize);
    const batchResult = await Promise.all(batch);
    result = [...result, ...batchResult];
  }
  return result;
}

/**
 * Get the token contract for the given address
 *
 * @param callerAddress Caller address
 * @param tokenaddress Token address
 * @returns The token contract and token info
 */
export async function getTokenContractForAddress(
  callerAddress: string,
  tokenaddress: string,
): Promise<{ contract: Contract; tokenInfo: TokenInfo }> {
  const signer = await ethers.getSigner(callerAddress);
  const inputTokenInfo = await fetchTokenInfoFromAddress(tokenaddress);
  const contract = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    tokenaddress,
    signer,
  );
  return {
    contract: contract,
    tokenInfo: inputTokenInfo,
  };
}

/**
 * Split the input array into batches with the given batch size
 *
 * @param array - Input array
 * @param batchSize - Batch size
 * @returns - Array of batches
 */
export function splitToBatches<T>(array: T[], batchSize: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < array.length; i += batchSize) {
    result.push(array.slice(i, i + batchSize));
  }
  return result;
}

/**
 * Save the data to a file
 * - Create the immediate parent directories if they do not exist
 *
 * @param filePath - The file path
 * @param data - The data to save in string format
 */
export function saveToFile(filePath: string, data: string): void {
  // Create the immediate parent directories if they do not exist
  const path = require("path");
  const fs = require("fs");

  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, data);
}
