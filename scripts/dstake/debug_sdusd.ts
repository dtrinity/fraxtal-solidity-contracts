import { ethers } from "hardhat";

/**
 * Quick debugging helper for the Fraxtal-testnet sdUSD deployment.
 *
 * It prints the key wiring information so we can see at a glance why
 * convertToAssets() might be returning zero.
 *
 * Usage:
 *   npx hardhat run scripts/dstake/debug_sdusd.ts --network fraxtal_testnet
 */
async function main() {
  // ------------------------------------------------------------
  // 👉 CHANGE THESE IF YOU ARE DIAGNOSING A DIFFERENT INSTANCE
  // ------------------------------------------------------------
  const SDUSD_ADDRESS = "0x0aC5Ec7aF3861807185C5b54B75107b70511A308"; // DStakeToken(sdUSD)
  const WRAPPED_DUSD_ADDRESS = "0xe1792e576378eBde40843496C7feE1bF14daB748"; // wddUSD (StaticATokenLM)

  const sdUSD = await ethers.getContractAt("DStakeToken", SDUSD_ADDRESS);

  const decimals = await sdUSD.decimals();
  const oneShare = 1n;
  const oneShareUnits = 1n * 10n ** BigInt(decimals);

  console.log("=== sdUSD (DStakeToken) ===");
  console.log("address:", SDUSD_ADDRESS);
  console.log("decimals:", decimals);
  console.log("totalSupply:", (await sdUSD.totalSupply()).toString());
  console.log("totalAssets():", (await sdUSD.totalAssets()).toString());
  console.log(`convertToAssets(1):             ${(await sdUSD.convertToAssets(oneShare)).toString()}`);
  console.log(`convertToAssets(1 * 10^dec):    ${(await sdUSD.convertToAssets(oneShareUnits)).toString()}`);

  // ----------------------------------------------------------------------
  // Collateral vault wiring
  // ----------------------------------------------------------------------
  const collateralVaultAddress = await sdUSD.collateralVault();
  const routerAddress = await sdUSD.router();

  console.log("\n=== Wiring ===");
  console.log("DStakeToken.router():           ", routerAddress);
  console.log("DStakeToken.collateralVault():  ", collateralVaultAddress);

  const collateralVault = await ethers.getContractAt("DStakeCollateralVault", collateralVaultAddress);
  const router = await ethers.getContractAt("DStakeRouterDLend", routerAddress);

  // Check role & router stored inside the vault
  const vaultRouterStored = await collateralVault.router();
  const ROUTER_ROLE = await collateralVault.ROUTER_ROLE();
  const hasRouterRole = await collateralVault.hasRole(ROUTER_ROLE, routerAddress);

  console.log("\n=== CollateralVault ===");
  console.log("router():", vaultRouterStored);
  console.log("router has ROUTER_ROLE:", hasRouterRole);

  // Supported assets list
  const supported: string[] = await collateralVault.getSupportedAssets();
  console.log("supportedAssets:", supported);

  // Print details per supported asset
  console.log("\n=== Asset breakdown ===");
  for (const asset of supported) {
    const erc20 = await ethers.getContractAt("@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata", asset);
    const symbol = await erc20.symbol();
    const balance = await erc20.balanceOf(collateralVaultAddress);
    const adapterAddress = await router.vaultAssetToAdapter(asset);
    console.log(`Asset ${symbol} (${asset}) -> balance ${balance.toString()} | adapter ${adapterAddress}`);

    if (adapterAddress !== ethers.ZeroAddress) {
      try {
        const adapter = await ethers.getContractAt("IDStableConversionAdapter", adapterAddress);
        const value = await adapter.assetValueInDStable(asset, balance);
        console.log(`   ↳ adapter.assetValueInDStable(): ${value.toString()}`);
      } catch (e) {
        console.log("   ↳ assetValueInDStable() call failed", e);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
