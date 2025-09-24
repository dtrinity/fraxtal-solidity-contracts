import { ethers } from "ethers";
import hre from "hardhat";

import { getConfig } from "../../../config/config";
import { getPoolContractAddress } from "../../../utils/lending/pool";

/**
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/dex/quote_swap.ts
 */
async function main(): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(dexDeployer);

  const config = await getConfig(hre);

  // Get Lending pools
  const lendingPoolAddress = await getPoolContractAddress();
  const lendingPool = await hre.ethers.getContractAt("Pool", lendingPoolAddress, signer);

  // Supply dUSD to the lending pool
  const res = await lendingPool
    .connect(signer)
    .supply(config.dLoopCurve?.dUSDAddress as string, ethers.parseUnits("1000", 6), dexDeployer, 0);

  const output = await res.wait();
  console.log(output);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
