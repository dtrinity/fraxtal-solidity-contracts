import hre, { ethers } from "hardhat";

import { API3Wrapper } from "../../typechain-types";
import { API3_ORACLE_WRAPPER_ID } from "../../utils/oracle/deploy-ids";

/**
 * Sets up API3 oracle proxies for various assets.
 * This script configures the API3Wrapper contract with asset-oracle pairings.
 *
 * @returns {Promise<void>}
 */
async function main(): Promise<void> {
  // Hard-coded list of assets and their corresponding API3 oracle addresses
  const assets = [
    {
      name: "FRAX",
      assetAddress: "0x2CAb811d351B4eF492D8C197E09939F1C9f54330",
      oracleAddress: "0x6Aae0Db059357cD59a451b8486EFB1b2Af141785",
    },
    {
      name: "sFRAX",
      assetAddress: "0x0Dbf64462FEC588df32FC5C9941421F7d93e0Fb3",
      oracleAddress: "0x4D1fE37682FD235d0861Daf74573db37d1d0f676",
    },
    {
      name: "DAI",
      assetAddress: "0x828a7248daD914435F452D73363491Ab7ec4D8f4",
      oracleAddress: "0x881c60d9C000a954E87B6e24700998EF89501a8a",
    },
    {
      name: "sDAI",
      assetAddress: "0x4CB47b0FD8f8EfF846889D3BEaD1c33bc93C7FD6",
      oracleAddress: "0x7dEBBD60b21177E7686C3BA9a99f58D5838BF7bb",
    },
    {
      name: "USDe",
      assetAddress: "0x78C4fa90703C8D905b83416Cda5b2F77A8C386C5",
      oracleAddress: "0x45C3e10E3a9A4DDB35Edba2c03610CFd4A83fcE0",
    },
    {
      name: "sUSDe",
      assetAddress: "0x99Df29568C899D0854017de5D265aAF42Cb123fA",
      oracleAddress: "0xC2f626B858ab6F6cAcc25670b6996323F8656E88",
    },
  ];

  // API3Wrapper contract address
  const api3WrapperAddress = (await hre.deployments.get(API3_ORACLE_WRAPPER_ID)).address;

  // Get the API3Wrapper contract instance
  const api3Wrapper = (await ethers.getContractAt("API3Wrapper", api3WrapperAddress)) as API3Wrapper;

  // Set proxies for each asset
  for (const asset of assets) {
    console.log(`Setting proxy for ${asset.name}...`);
    await api3Wrapper.setProxy(asset.assetAddress, asset.oracleAddress);
    console.log(`Proxy set for ${asset.name}: Asset ${asset.assetAddress}, Oracle ${asset.oracleAddress}`);
  }

  console.log("All proxies have been set successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
