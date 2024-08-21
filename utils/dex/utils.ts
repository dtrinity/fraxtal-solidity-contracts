import { BigNumber } from "@ethersproject/bignumber";
import bn from "bignumber.js";
import { BigNumberish, ethers } from "ethers";

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

/**
 * Encode the price of a pair of tokens to Q = sqrt(reserve1 / reserve0) * 2^96.
 * - Code Reference: https://gist.github.com/BlockmanCodes/d50eadf80447db00a99df2559700054e#file-03_deploypools-js
 *
 * In UniswapV3 contract, the sqrtPriceX96 has 160 bits, but the integer part is 64 bits
 * and the fractional part is 96 bits. The price is calculated as sqrt(reserve1 / reserve0) * 2^96.
 * - Reference: https://blog.uniswap.org/uniswap-v3-math-primer
 *
 * @param params - The reserve1 and reserve0 of the pair of tokens
 * @param params.reserve1 - The reserve1 of the pair of tokens
 * @param params.reserve0 - The reserve0 of the pair of tokens
 * @returns The encoded price
 */
export function encodePriceSqrtX96(params: {
  reserve1: BigNumberish;
  reserve0: BigNumberish;
}): BigNumber {
  return BigNumber.from(
    new bn(params.reserve1.toString())
      .div(params.reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString(),
  );
}

/**
 * Convert the encoded price to decimal for human-readable format.
 * - This function is not in the original deployment code. It is added for inspecting purposes.
 *
 * @param priceSqrtX96 - The encoded price (from encodePriceSqrtX96 function)
 * @returns The estimated decimal value of the price (may have some rounding errors)
 */
export function convertSqrtPriceX96ToDecimal(priceSqrtX96: BigNumber): string {
  return new bn(priceSqrtX96.toString())
    .div(new bn(2).pow(96))
    .pow(2)
    .toString();
}

/**
 * Convert the encoded price to decimal for executable format.
 *
 * @param tokenPaths - The token paths for the swap (e.g., [token0, token1, token2])
 * @param feePaths - The fee paths for the swap (e.g., [3000, 3000]). It must have one less element than tokenPaths
 * @param isExactInput - The flag to indicate if the swap is exact input or exact output
 * @returns - The encoded swap path
 */
export function convertToSwapPath(
  tokenPaths: string[],
  feePaths: number[],
  isExactInput: boolean,
): string {
  if (tokenPaths.length < 2) {
    throw new Error(`Token paths must have at least 2 tokens: ${tokenPaths}`);
  }

  if (tokenPaths.length !== feePaths.length + 1) {
    throw new Error(
      `Token paths must have one more token than fee paths: ${tokenPaths} vs ${feePaths}`,
    );
  }

  const typeArray: string[] = ["address"];

  for (let i = 1; i < tokenPaths.length; i++) {
    typeArray.push(...["uint24", "address"]);
  }
  const valuesArray: any[] = [tokenPaths[0]];

  for (let i = 1; i < tokenPaths.length; i++) {
    valuesArray.push(feePaths[i - 1]);
    valuesArray.push(tokenPaths[i]);
  }

  if (isExactInput) {
    // Reverse the order of the token paths
    valuesArray.reverse();
    typeArray.reverse();
  }

  return ethers.solidityPacked(typeArray, valuesArray);
}
