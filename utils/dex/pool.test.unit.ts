import { ChainId } from "@uniswap/sdk-core";

import { TokenInfo } from "../token";
import { calculatePosition, PoolData } from "./pool";

jest.useFakeTimers();

describe("Test calculatePosition", () => {
  const testCases: {
    name: string;
    token0Info: TokenInfo;
    token1Info: TokenInfo;
    poolData: PoolData;
    inputToken0Amount: number;
    expected: {
      amount0: string;
      amount1: string;
    };
  }[] = [
    {
      name: "Ratio 1:5",
      token0Info: fakeToken(
        "0x0D92d35D311E54aB8EEA0394d7E773Fc5144491a",
        18,
        "USDT",
      ),
      token1Info: fakeToken(
        "0xD56e6F296352B03C3c3386543185E9B8c2e5Fd0b",
        18,
        "DUSD",
      ),
      poolData: {
        tick: -16096n,
        tickSpacing: 10n,
        fee: 500n,
        sqrtPriceX96: 35431911422859142059220343232n, // Raito 1:5
        liquidity: 0n,
      },
      inputToken0Amount: 1e6,
      expected: {
        amount0: "1000000000000000000000000",
        amount1: "200917979363517164388486",
      },
    },
    {
      name: "Ratio 1:5",
      token0Info: fakeToken(
        "0x0D92d35D311E54aB8EEA0394d7E773Fc5144491a",
        18,
        "USDT",
      ),
      token1Info: fakeToken(
        "0xD56e6F296352B03C3c3386543185E9B8c2e5Fd0b",
        18,
        "DUSD",
      ),
      poolData: {
        tick: -16096n,
        tickSpacing: 10n,
        fee: 500n,
        sqrtPriceX96: 35431911422859142059220343232n, // Raito 1:5
        liquidity: 0n,
      },
      inputToken0Amount: 9432423e8,
      expected: {
        amount0: "943242300000000000000000000000000",
        amount1: "189514336966196466227273589355579",
      },
    },
    {
      name: "Ratio 1:5 (swap the addresses)",
      token0Info: fakeToken(
        "0xD56e6F296352B03C3c3386543185E9B8c2e5Fd0b",
        18,
        "USDT",
      ),
      token1Info: fakeToken(
        "0x0D92d35D311E54aB8EEA0394d7E773Fc5144491a",
        18,
        "DUSD",
      ),
      poolData: {
        tick: -16096n,
        tickSpacing: 10n,
        fee: 500n,
        sqrtPriceX96: 35431911422859142059220343232n, // Raito 1:5
        liquidity: 0n,
      },
      inputToken0Amount: 9432423e8,
      expected: {
        amount0: "4694663479037927433771112776546905",
        amount1: "943242300000000000000000000000000",
      },
    },
    {
      name: "Ratio 1:1",
      token0Info: fakeToken(
        "0x0D92d35D311E54aB8EEA0394d7E773Fc5144491a",
        18,
        "USDT",
      ),
      token1Info: fakeToken(
        "0xD56e6F296352B03C3c3386543185E9B8c2e5Fd0b",
        18,
        "TRIN",
      ),
      poolData: {
        tick: 0n,
        tickSpacing: 10n,
        fee: 500n,
        sqrtPriceX96: 79228162514264337593543950336n, // Raito 1:1
        liquidity: 0n,
      },
      inputToken0Amount: 100e18,
      expected: {
        amount0: "100000000000000000000000000000000000000",
        amount1: "99999999999999999999999999994405653143",
      },
    },
    {
      name: "Ratio 1:1 (swap the addresses)",
      token0Info: fakeToken(
        "0xD56e6F296352B03C3c3386543185E9B8c2e5Fd0b",
        18,
        "USDT",
      ),
      token1Info: fakeToken(
        "0x0D92d35D311E54aB8EEA0394d7E773Fc5144491a",
        18,
        "TRIN",
      ),
      poolData: {
        tick: 0n,
        tickSpacing: 10n,
        fee: 500n,
        sqrtPriceX96: 79228162514264337593543950336n, // Raito 1:1
        liquidity: 0n,
      },
      inputToken0Amount: 100e18,
      expected: {
        amount0: "100000000000000000000000000005594346858",
        amount1: "100000000000000000000000000000000000000",
      },
    },
    {
      name: "Ratio 1:1",
      token0Info: fakeToken(
        "0x0D92d35D311E54aB8EEA0394d7E773Fc5144491a",
        18,
        "USDT",
      ),
      token1Info: fakeToken(
        "0xD56e6F296352B03C3c3386543185E9B8c2e5Fd0b",
        18,
        "TRIN",
      ),
      poolData: {
        tick: 0n,
        tickSpacing: 10n,
        fee: 500n,
        sqrtPriceX96: 79228162514264337593543950336n, // Raito 1:1
        liquidity: 0n,
      },
      inputToken0Amount: 534545e8,
      expected: {
        amount0: "53454500000000000000000000000000",
        amount1: "53454499999999999999999999997010",
      },
    },
  ];
  testCases.forEach((testCase) => {
    it(`Case: ${testCase.name} with liquidity amount ${testCase.inputToken0Amount}`, () => {
      const result = calculatePosition(
        ChainId.SEPOLIA,
        testCase.poolData,
        testCase.token0Info,
        testCase.token1Info,
        testCase.inputToken0Amount,
      );
      expect(result).toBeDefined();
      expect({
        amount0: result.mintAmounts.amount0.toString(),
        amount1: result.mintAmounts.amount1.toString(),
      }).toEqual(testCase.expected);
    });
  });
});

/**
 * Create a fake token
 *
 * @param address - The token address
 * @param decimals - The token decimals
 * @param symbol - The token symbol
 * @returns The token information
 */
function fakeToken(
  address: string,
  decimals: number,
  symbol: string,
): TokenInfo {
  return {
    address,
    decimals,
    symbol,
    name: "TestingToken",
  };
}
