import hre from "hardhat";

import { getConfig } from "../../../config/config";
import { CURVE_POOLS, TOKEN_INFO } from "../../../config/networks/fraxtal_testnet";
import { ICurveRouterNgPoolsOnlyV1 } from "../../../typechain-types";

/**
 * Estimate the required input amount for a Curve swap
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/liquidator-bot/curve/estimate_curve_dx_dy.ts
 */
async function main(): Promise<void> {
  const config = await getConfig(hre);

  if (!config.liquidatorBotCurve) {
    throw new Error("Liquidator bot Curve config is not set");
  }

  if (!config.liquidatorBotCurve.swapRouter) {
    throw new Error("Curve router address is not set in config");
  }
  // Example route and swap params from fraxtal_testnet.ts
  const route: [string, string, string, string, string, string, string, string, string, string, string] = [
    TOKEN_INFO.dUSD.address,
    CURVE_POOLS.stableswapng.dUSD_FRAX.address,
    TOKEN_INFO.FRAX.address,
    CURVE_POOLS.stableswapng.FRAX_sFRAX.address,
    TOKEN_INFO.sFRAX.address,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
  ];

  const swapParams: [
    [bigint, bigint, bigint, bigint],
    [bigint, bigint, bigint, bigint],
    [bigint, bigint, bigint, bigint],
    [bigint, bigint, bigint, bigint],
    [bigint, bigint, bigint, bigint],
  ] = [
    [0n, 1n, 1n, 2n],
    [0n, 1n, 1n, 2n],
    [0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n],
  ];

  const reversedRoute: [string, string, string, string, string, string, string, string, string, string, string] = [
    TOKEN_INFO.sFRAX.address,
    CURVE_POOLS.stableswapng.FRAX_sFRAX.address,
    TOKEN_INFO.FRAX.address,
    CURVE_POOLS.stableswapng.dUSD_FRAX.address,
    TOKEN_INFO.dUSD.address,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
    hre.ethers.ZeroAddress,
  ];

  const reversedSwapParams: [
    [bigint, bigint, bigint, bigint],
    [bigint, bigint, bigint, bigint],
    [bigint, bigint, bigint, bigint],
    [bigint, bigint, bigint, bigint],
    [bigint, bigint, bigint, bigint],
  ] = [
    [1n, 0n, 1n, 2n],
    [1n, 0n, 1n, 2n],
    [0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n],
    [0n, 0n, 0n, 0n],
  ];

  console.log("Route:", route);
  console.log("Swap params:", swapParams);

  const amountOut = hre.ethers.parseEther("439"); // Example output amount

  const curveRouter = (await hre.ethers.getContractAt(
    "ICurveRouterNgPoolsOnlyV1",
    config.liquidatorBotCurve.swapRouter,
  )) as ICurveRouterNgPoolsOnlyV1;

  const estimatedAmountIn = await curveRouter.get_dx(route, swapParams, amountOut);

  console.log("Estimated input amount:", estimatedAmountIn.toString());

  const estimatedAmountOut = await curveRouter.get_dy(route, swapParams, estimatedAmountIn);

  console.log("Estimated output amount:", estimatedAmountOut.toString());

  console.log("\nReversed route and params:");

  console.log("Reversed route:", reversedRoute);
  console.log("Reversed swap params:", reversedSwapParams);

  // Convert Result objects to regular arrays
  const normalizedReversedRoute = [...reversedRoute];
  const normalizedReversedSwapParams = reversedSwapParams.map((param) => [...param]);

  // Test the reversed route/params with get_dy
  const estimatedAmountInWithReversed = await curveRouter.get_dy(
    normalizedReversedRoute as [string, string, string, string, string, string, string, string, string, string, string],
    normalizedReversedSwapParams as [
      [bigint, bigint, bigint, bigint],
      [bigint, bigint, bigint, bigint],
      [bigint, bigint, bigint, bigint],
      [bigint, bigint, bigint, bigint],
      [bigint, bigint, bigint, bigint],
    ],
    amountOut,
  );

  console.log("\nEstimated amount in using reversed route/params:", estimatedAmountInWithReversed.toString());

  const estimatedAmountOutWithReversed = await curveRouter.get_dx(
    normalizedReversedRoute as [string, string, string, string, string, string, string, string, string, string, string],
    normalizedReversedSwapParams as [
      [bigint, bigint, bigint, bigint],
      [bigint, bigint, bigint, bigint],
      [bigint, bigint, bigint, bigint],
      [bigint, bigint, bigint, bigint],
      [bigint, bigint, bigint, bigint],
    ],
    estimatedAmountInWithReversed,
  );

  console.log("\nEstimated amount out using reversed route/params:", estimatedAmountOutWithReversed.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
