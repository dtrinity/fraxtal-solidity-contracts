/*
This is needed because there's currently no way in ethers.js to link a
library when you're working with the contract ABI/bytecode.

See https://github.com/ethers-io/ethers.js/issues/195
*/

import { ethers } from "ethers";

/**
 * Link the libraries in the bytecode
 * - Reference: https://github.com/Uniswap/hardhat-v3-deploy/blob/382619a6c372f26c0478f17f665bb0b2521c9f5b/src/util/linkLibraries.ts
 *
 * @param bytecode - The bytecode to link
 * @param bytecode.bytecode - The bytecode to link
 * @param bytecode.linkReferences - The link references
 * @returns The linked bytecode
 */
export const linkLibraries = (
  {
    bytecode,
    linkReferences,
  }: {
    bytecode: string;
    linkReferences: {
      [fileName: string]: {
        [contractName: string]: { length: number; start: number }[];
      };
    };
  },
  libraries: { [libraryName: string]: string },
): string => {
  Object.keys(linkReferences).forEach((fileName) => {
    Object.keys(linkReferences[fileName]).forEach((contractName) => {
      if (!libraries.hasOwnProperty(contractName)) {
        throw new Error(`Missing link library name ${contractName}`);
      }
      const address = ethers
        .getAddress(libraries[contractName])
        .toLowerCase()
        .slice(2);
      linkReferences[fileName][contractName].forEach(
        ({ start: byteStart, length: byteLength }) => {
          const start = 2 + byteStart * 2;
          const length = byteLength * 2;
          bytecode = bytecode
            .slice(0, start)
            .concat(address)
            .concat(bytecode.slice(start + length, bytecode.length));
        },
      );
    });
  });
  return bytecode;
};
