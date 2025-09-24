import { ethers } from "hardhat";

import { MockAPI3OracleAlwaysAlive } from "../../typechain-types";
import { API3_PRICE_DECIMALS } from "../../utils/oracle_aggregator/constants";

/**
 * Sets mock price for a MockAPI3OracleAlwaysAlive
 *
 * @param mockOracleAddress The address of the MockAPI3OracleAlwaysAlive contract
 * @param price The price to set
 * @returns Promise that resolves when the mock price is set
 */
async function setMockPrice(mockOracleAddress: string, price: number): Promise<void> {
  // Get the contract instance
  const mockOracle = (await ethers.getContractAt("MockAPI3OracleAlwaysAlive", mockOracleAddress)) as MockAPI3OracleAlwaysAlive;

  // Scale the price to match API3 decimals
  const scaledPrice = ethers.parseUnits(price.toString(), API3_PRICE_DECIMALS);

  // Set the mock price
  const tx = await mockOracle.setMock(scaledPrice);
  await tx.wait();

  console.log(`Set mock price to $${price} for oracle at ${mockOracleAddress}`);
}

/**
 * Main function to set mock price for an API3 oracle
 */
async function main(): Promise<void> {
  // Get command line arguments
  const oracleAddress = "0x4D1fE37682FD235d0861Daf74573db37d1d0f676"; // sFRAX/FRAX
  const priceStr = "3.948391";
  const price = parseFloat(priceStr);

  if (isNaN(price)) {
    throw new Error("Invalid price provided");
  }

  if (!ethers.isAddress(oracleAddress)) {
    throw new Error("Invalid oracle address provided");
  }

  try {
    await setMockPrice(oracleAddress, price);
    console.log("Successfully set mock price");
  } catch (error) {
    console.error("Failed to set mock price:", error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
