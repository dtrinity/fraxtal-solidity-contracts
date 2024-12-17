import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "dotenv/config";

import { SolidityUserConfig } from "hardhat/types";

const DEFAULT_DEX_COMPILER_SETTINGS = {
  version: "0.7.6",
  settings: {
    evmVersion: "istanbul",
    optimizer: {
      enabled: true,
      runs: 200,
    },
    metadata: {
      // do not include the metadata hash, since this is machine dependent
      // and we want all generated code to be deterministic
      // https://docs.soliditylang.org/en/v0.7.6/metadata.html
      bytecodeHash: "none",
    },
  },
};

const DEFAULT_DEX_PERMIT2_COMPILER_SETTINGS = {
  version: "0.8.17",
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "london",
    viaIR: true,
  },
};

const DEFAULT_LENDING_COMPILER_SETTINGS = {
  version: "0.8.10",
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "london",
    viaIR: true,
  },
};

const DEFAULT_LENDING_LIQUIDATOR_COMPILER_SETTINGS = {
  version: "0.8.13",
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "london",
    viaIR: true,
  },
};

/**
 * Get default Solidity compilers configuration
 *
 * @returns Default Solidity compilers configuration
 */
export function getDefaultSolidityCompilersConfig(): SolidityUserConfig {
  return {
    compilers: [
      DEFAULT_DEX_COMPILER_SETTINGS,
      DEFAULT_DEX_PERMIT2_COMPILER_SETTINGS,
      DEFAULT_LENDING_COMPILER_SETTINGS,
      DEFAULT_LENDING_LIQUIDATOR_COMPILER_SETTINGS,
      {
        version: "0.8.2",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "london",
          viaIR: true,
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "london",
          viaIR: true,
        },
      },
      {
        // TODO: Remove this once all tests for aave and uniswap are ported
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
    overrides: {
      "contracts/dex/core/libraries/TickBitmap.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/lens/TickLens.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/libraries/PoolAddress.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/libraries/PoolTicksCounter.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/NonfungiblePositionManager.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/test/MockTimeNonfungiblePositionManager.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/test/NFTDescriptorTest.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/NonfungibleTokenPositionDescriptor.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/libraries/NFTDescriptor.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
      "contracts/dex/periphery/libraries/ChainId.sol":
        DEFAULT_DEX_COMPILER_SETTINGS,
    },
  };
}
