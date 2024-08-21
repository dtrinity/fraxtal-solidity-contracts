import { ethers } from "hardhat";

/**
 * Increase time and mine a block
 *
 * @param seconds - The number of seconds to increase
 */
export async function increaseTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}
