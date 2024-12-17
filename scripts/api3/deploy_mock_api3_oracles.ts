import { ethers, getNamedAccounts } from "hardhat";

import { API3_PRICE_DECIMALS } from "../../test/oracle_aggregator/constants";
import { MockAPI3OracleAlwaysAlive } from "../../typechain-types";

// Helper function to deploy a MockAPI3OracleAlwaysAlive contract
/**
 * Deploys a MockAPI3OracleAlwaysAlive contract
 *
 * @param api3ServerV1Address Arbitrary address, not needed for anything except deployment
 * @returns Promise that resolves to the deployed MockAPI3OracleAlwaysAlive contract
 */
async function deployMockAPI3Oracle(
  api3ServerV1Address: string,
): Promise<MockAPI3OracleAlwaysAlive> {
  const MockAPI3Oracle = await ethers.getContractFactory(
    "MockAPI3OracleAlwaysAlive",
  );
  const mockOracle = await MockAPI3Oracle.deploy(api3ServerV1Address);
  await mockOracle.waitForDeployment();
  return mockOracle;
}

// Helper function to set mock price
/**
 * Sets mock price for a MockAPI3OracleAlwaysAlive
 *
 * @param mockOracle The MockAPI3OracleAlwaysAlive contract instance
 * @param price The price to set
 * @returns Promise that resolves when the mock price is set
 */
async function setMockPrice(
  mockOracle: MockAPI3OracleAlwaysAlive,
  price: number,
): Promise<void> {
  const scaledPrice = ethers.parseUnits(price.toString(), API3_PRICE_DECIMALS);
  await mockOracle.setMock(scaledPrice);
}

/**
 * Main function to deploy and configure MockAPI3Oracles for multiple assets
 *
 * @returns Promise that resolves when all oracles are deployed and configured
 */
async function main(): Promise<void> {
  const { _dusdDeployer } = await getNamedAccounts(); // Prefix with underscore to indicate it's unused

  // Input list of assets, addresses, and prices
  const assets = [
    {
      symbol: "FRAX",
      address: "0x2CAb811d351B4eF492D8C197E09939F1C9f54330",
      price: 1,
    },
    {
      symbol: "sFRAX",
      address: "0x0Dbf64462FEC588df32FC5C9941421F7d93e0Fb3",
      price: 1.1,
    },
    {
      symbol: "DAI",
      address: "0x828a7248daD914435F452D73363491Ab7ec4D8f4",
      price: 1,
    },
    {
      symbol: "sDAI",
      address: "0x4CB47b0FD8f8EfF846889D3BEaD1c33bc93C7FD6",
      price: 1.1,
    },
    {
      symbol: "USDe",
      address: "0x78C4fa90703C8D905b83416Cda5b2F77A8C386C5",
      price: 1,
    },
    {
      symbol: "sUSDe",
      address: "0x99Df29568C899D0854017de5D265aAF42Cb123fA",
      price: 1.1,
    },
  ];

  // Arbitrary address, not needed for anything except deployment
  const mockAPI3ServerV1Address = "0x0b38210ea11411557c13457D4dA7dC6ea731B88a";

  for (const asset of assets) {
    // Deploy MockAPI3Oracle
    const mockOracle = await deployMockAPI3Oracle(mockAPI3ServerV1Address);
    console.log(
      `MockAPI3Oracle for ${asset.symbol} deployed to:`,
      await mockOracle.getAddress(),
    );

    // Set mock price
    await setMockPrice(mockOracle, asset.price);
    console.log(`Set mock price for ${asset.symbol}: $${asset.price}`);
  }

  console.log("Deployment and configuration completed successfully");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
