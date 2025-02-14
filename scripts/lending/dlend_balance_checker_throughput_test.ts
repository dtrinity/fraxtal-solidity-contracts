import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "hardhat";

import { DLEND_BALANCE_CHECKER_ID } from "../../utils/lending/deploy-ids";

/**
 * Script to test the throughput of dLendBalanceChecker contract by checking balances
 * for 1000 random addresses. This helps verify the contract can handle large batch requests.
 *
 * @returns void
 */
async function main(): Promise<void> {
  const hre = await import("hardhat");
  const { deployments } = hre;

  // Get the deployed dLendBalanceChecker contract
  const balanceChecker = await deployments.get(DLEND_BALANCE_CHECKER_ID);
  const balanceCheckerContract = await ethers.getContractAt(
    "dLendBalanceChecker",
    balanceChecker.address,
  );

  // Generate 1000 random addresses
  const addresses: string[] = [];

  for (let i = 0; i < 1000; i++) {
    const wallet = ethers.Wallet.createRandom();
    addresses.push(wallet.address);
  }

  console.log(`Generated ${addresses.length} random addresses`);
  console.log("First few addresses:", addresses.slice(0, 3));
  console.log("Balance checker address:", balanceChecker.address);

  // Get all mapped tokens from events
  const sources = [balanceChecker.address]; // For testing, just use the checker itself as a token

  try {
    console.log("Testing batchTokenBalances...");
    const startTime = Date.now();

    const result = await balanceCheckerContract.batchTokenBalances(
      sources,
      addresses,
    );

    const endTime = Date.now();
    console.log(`Test completed in ${endTime - startTime}ms`);
    console.log(
      `First few results:`,
      result.slice(0, 3).map((r: BigNumber) => r.toString()),
    );

    console.log("Test successful! The contract can handle 1000 addresses");
  } catch (error) {
    console.error("Test failed with error:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
