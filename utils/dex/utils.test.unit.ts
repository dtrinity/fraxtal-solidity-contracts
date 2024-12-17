import { BigNumber } from "@ethersproject/bignumber";
import { ethers } from "ethers";

import {
  convertSqrtPriceX96ToDecimal,
  convertToSwapPath,
  encodePriceSqrtX96,
} from "./utils";

describe("Test encodePriceSqrtX96 and convertSqrtPriceX96ToDecimal", () => {
  const testCases: {
    reserve1: number;
    reserve0: number;
    encodeExpected: BigNumber;
    decodeExpected: number;
  }[] = [
    {
      reserve1: 100,
      reserve0: 200,
      encodeExpected: BigNumber.from("56022770974786139918731938227"),
      decodeExpected: 0.5,
    },
    {
      reserve1: 200,
      reserve0: 100,
      encodeExpected: BigNumber.from("112045541949572279837463876454"),
      decodeExpected: 2,
    },
    {
      reserve1: 100,
      reserve0: 100,
      encodeExpected: BigNumber.from("79228162514264337593543950336"),
      decodeExpected: 1,
    },
    {
      reserve1: 100,
      reserve0: 30000000,
      encodeExpected: BigNumber.from("144650172662492649647717392"),
      decodeExpected: 0.0000033333333333333335,
    },
    {
      reserve1: 1,
      reserve0: 5,
      encodeExpected: BigNumber.from("35431911422859142059220343232"),
      decodeExpected: 0.2,
    },
    {
      reserve1: 124544,
      reserve0: 8784324,
      encodeExpected: BigNumber.from("9433803279167052514955011588"),
      decodeExpected: 0.014177983416822968,
    },
  ];
  testCases.forEach((testCase) => {
    it(`encoding reserve1=${testCase.reserve1} and reserve0=${testCase.reserve0}`, () => {
      const result = encodePriceSqrtX96({
        reserve1: BigNumber.from(testCase.reserve1).toBigInt(),
        reserve0: BigNumber.from(testCase.reserve0).toBigInt(),
      });
      expect(result).toBeDefined();
      expect(result.toString()).toEqual(testCase.encodeExpected.toString());
    });

    it(`decoding ${testCase.encodeExpected}`, () => {
      const result = encodePriceSqrtX96({
        reserve1: BigNumber.from(testCase.reserve1).toBigInt(),
        reserve0: BigNumber.from(testCase.reserve0).toBigInt(),
      });
      const decoded = convertSqrtPriceX96ToDecimal(result);
      expect(decoded).toBeDefined();

      // Convert decoded to number for comparison
      const decodedNumber = parseFloat(decoded);
      expect(decodedNumber).toBeCloseTo(testCase.decodeExpected, 15);
    });
  });
});

describe("Test convertToSwapPath()", () => {
  const validCases: {
    tokenPaths: string[];
    feePaths: number[];
    exactInput: boolean;
    expected: string;
  }[] = [
    {
      tokenPaths: [numberToAddress(1), numberToAddress(2)],
      feePaths: [3000],
      exactInput: false,
      expected:
        "0x0000000000000000363336613930316132333732000bb80000000000000000333162353438306431316239",
    },
    {
      tokenPaths: [numberToAddress(1), numberToAddress(2), numberToAddress(3)],
      feePaths: [3000, 434],
      exactInput: false,
      expected:
        "0x00000000000000003935316664383237333532620001b20000000000000000363336613930316132333732000bb80000000000000000333162353438306431316239",
    },
    {
      tokenPaths: [
        numberToAddress(1),
        numberToAddress(2),
        numberToAddress(3),
        numberToAddress(4),
      ],
      feePaths: [3000, 434, 87632],
      exactInput: false,
      expected:
        "0x000000000000000063366435323033343436653401565000000000000000003935316664383237333532620001b20000000000000000363336613930316132333732000bb80000000000000000333162353438306431316239",
    },
    {
      tokenPaths: [numberToAddress(1), numberToAddress(2)],
      feePaths: [3000],
      exactInput: true,
      expected:
        "0x0000000000000000333162353438306431316239000bb80000000000000000363336613930316132333732",
    },
    {
      tokenPaths: [numberToAddress(1), numberToAddress(2), numberToAddress(3)],
      feePaths: [3000, 434],
      exactInput: true,
      expected:
        "0x0000000000000000333162353438306431316239000bb800000000000000003633366139303161323337320001b20000000000000000393531666438323733353262",
    },
    {
      tokenPaths: [
        numberToAddress(1),
        numberToAddress(2),
        numberToAddress(3),
        numberToAddress(4),
      ],
      feePaths: [3000, 434, 87632],
      exactInput: true,
      expected:
        "0x0000000000000000333162353438306431316239000bb800000000000000003633366139303161323337320001b200000000000000003935316664383237333532620156500000000000000000633664353230333434366534",
    },
  ];
  validCases.forEach((testCase) => {
    it(`encoding tokenPaths=${testCase.tokenPaths} and feePaths=${testCase.feePaths} (exactInput=${testCase.exactInput})`, () => {
      expect(
        convertToSwapPath(
          testCase.tokenPaths,
          testCase.feePaths,
          testCase.exactInput,
        ),
      ).toEqual(testCase.expected);
    });
  });
});

/**
 * Convert a number to an Ethereum address (20 bytes)
 *
 * @param num - The seed number
 * @returns The Ethereum address
 */
function numberToAddress(num: number): string {
  // Add a very big number to the input number to convert it to a hexadecimal string
  num *= 54654667657657;
  const utf8Encode = new TextEncoder();
  const address = ethers.zeroPadValue(utf8Encode.encode(num.toString(16)), 20); // Pad the hexadecimal string to 20 bytes
  return address;
}
