import hre from "hardhat";

import { fetchTokenInfo, mintTestToken } from "../utils/token";

/**
 * Mint the default testnet tokens
 */
async function main(): Promise<void> {
  const receipent = "0x0fCedE925CD191749587906200B72276aEfC3deF";
  const tokenAddress = "0x1Cd7bFf2a65fEbF27164603352Ba850E1D53cc5c";
  const mintAmount = 1000000;

  const tokenInfo = await fetchTokenInfo(hre, tokenAddress);

  const { testTokenDeployer } = await hre.getNamedAccounts();
  await mintTestToken(
    hre,
    tokenAddress,
    await hre.ethers.getSigner(testTokenDeployer),
    receipent,
    mintAmount,
    tokenInfo.decimals,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
