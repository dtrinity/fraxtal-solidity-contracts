import hre from "hardhat";

import { MintConfig } from "../config/types";
import { deployTokensDefault } from "../utils/token";

/**
 * Deploy the default testnet tokens
 */
async function main(): Promise<void> {
  const mintInfos: { [tokenSymbol: string]: MintConfig[] } = {
    FXS: [
      {
        amount: 1000000000000,
        toAddress: "0x53Ae1433Ab4563d7D5a84d27524784837259f105",
      },
    ],
    sFRAX: [
      {
        amount: 1000000000000,
        toAddress: "0x53Ae1433Ab4563d7D5a84d27524784837259f105",
      },
    ],
    sfrxETH: [
      {
        amount: 1000000000000,
        toAddress: "0x53Ae1433Ab4563d7D5a84d27524784837259f105",
      },
    ],
    FRAX: [
      {
        amount: 1000000000000,
        toAddress: "0x53Ae1433Ab4563d7D5a84d27524784837259f105",
      },
    ],
    USDe: [
      {
        amount: 1000000000000,
        toAddress: "0x53Ae1433Ab4563d7D5a84d27524784837259f105",
      },
    ],
    DAI: [
      {
        amount: 1000000000000,
        toAddress: "0x53Ae1433Ab4563d7D5a84d27524784837259f105",
      },
    ],
    sUSDe: [
      {
        amount: 1000000000000,
        toAddress: "0x53Ae1433Ab4563d7D5a84d27524784837259f105",
      },
    ],
    sDAI: [
      {
        amount: 1000000000000,
        toAddress: "0x53Ae1433Ab4563d7D5a84d27524784837259f105",
      },
    ],
  };
  await deployTokensDefault(hre, mintInfos);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
