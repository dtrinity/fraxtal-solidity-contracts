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
  return network === "localhost" || network === "hardhat";
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

  constructor(ignoreDurationInSeconds: number) {
    this.memory = new Map<string, number>();
    this.ignoreDuration = ignoreDurationInSeconds * 1000; // Convert to milliseconds
  }

  put(value: string): void {
    const expiryTime = Date.now() + this.ignoreDuration;
    this.memory.set(value, expiryTime);
  }

  isIgnored(value: string): boolean {
    const expiryTime = this.memory.get(value);

    if (!expiryTime) {
      return false;
    }

    if (Date.now() < expiryTime) {
      return true;
    }
    this.memory.delete(value);
    return false;
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
