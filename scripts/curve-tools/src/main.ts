import curve from "@curvefi/api";

/**
 * Entry point for the script
 */
async function main(): Promise<void> {
  // Read named argument from CLI, throw error if not provided
  if (process.argv.length < 6) {
    throw new Error(
      "Usage: tsx main.ts <tokenIn> <tokenOut> <amountIn> <isTestnet>",
    );
  }
  const tokenIn = process.argv[2];
  const tokenOut = process.argv[3];
  const amountIn = process.argv[4];
  const isTestnet = process.argv[5];

  if (isTestnet !== "true" && isTestnet !== "false") {
    throw new Error("isTestnet must be either true or false");
  }

  if (isTestnet == "true") {
    console.log("Generating swap params on fraxtal testnet");
    await curve.init(
      "JsonRpc",
      {
        url: "https://rpc.testnet.frax.com",
        privateKey:
          "3d3c83c453b40ed9fe6ebeaa527cb354bc526218e69185786a4953909fb54e63",
      },
      { chainId: 2522 },
    );
  } else {
    console.log("Generating swap params on ethereum mainnet");
    await curve.init(
      "Infura",
      { network: "mainnet", apiKey: "9c52fc4e27554e868b243c18bf9631c7" },
      { chainId: 1 },
    );
    await curve.factory.fetchPools();
    await curve.crvUSDFactory.fetchPools();
    await curve.EYWAFactory.fetchPools();
    await curve.cryptoFactory.fetchPools();
    await curve.twocryptoFactory.fetchPools();
    await curve.tricryptoFactory.fetchPools();
    await curve.stableNgFactory.fetchPools();
  }

  console.log("Curve has router: ", curve.hasRouter());
  const { route, output } = await curve.router.getBestRouteAndOutput(
    tokenIn,
    tokenOut,
    amountIn,
  );
  console.log("Route: ", route);
  console.log("Output: ", output);
  const args = curve.router.getArgs(route);
  console.log("Args: ", args);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
