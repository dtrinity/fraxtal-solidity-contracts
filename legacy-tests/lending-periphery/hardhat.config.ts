import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "@tenderly/hardhat-tenderly";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-dependency-compiler";
import "hardhat-deploy";

import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/types";

import { accounts } from "./helpers/test-wallets";

dotenv.config({ path: "../.env" });

const DEFAULT_BLOCK_GAS_LIMIT = 12450000;
const REPORT_GAS = process.env.REPORT_GAS === "true";

// export hardhat config
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: { enabled: true, runs: 25000 },
          evmVersion: "london",
        },
      },
    ],
  },
  typechain: {
    outDir: "types",
    externalArtifacts: [
      "node_modules/@aave/core-v3/artifacts/contracts/**/*[!dbg].json",
      "node_modules/@aave/core-v3/artifacts/contracts/**/**/*[!dbg].json",
      "node_modules/@aave/core-v3/artifacts/contracts/**/**/**/*[!dbg].json",
      "node_modules/@aave/core-v3/artifacts/contracts/mocks/tokens/WETH9Mocked.sol/WETH9Mocked.json",
    ],
  },
  gasReporter: {
    enabled: REPORT_GAS ? true : false,
    coinmarketcap: process.env.COINMARKETCAP_API,
  },
  networks: {
    hardhat: {
      hardfork: "berlin",
      blockGasLimit: DEFAULT_BLOCK_GAS_LIMIT,
      gas: DEFAULT_BLOCK_GAS_LIMIT,
      gasPrice: 8000000000,
      chainId: 31337,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      accounts: accounts.map(
        ({ secretKey, balance }: { secretKey: string; balance: string }) => ({
          privateKey: secretKey,
          balance,
        }),
      ),
      allowUnlimitedContractSize: true,
    },
    ganache: {
      url: "http://ganache:8545",
      accounts: {
        mnemonic:
          "fox sight canyon orphan hotel grow hedgehog build bless august weather swarm",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
  },
  mocha: {
    timeout: 80000,
    bail: true,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    aclAdmin: {
      default: 0,
    },
    emergencyAdmin: {
      default: 0,
    },
    poolAdmin: {
      default: 0,
    },
    addressesProviderRegistryOwner: {
      default: 0,
    },
    treasuryProxyAdmin: {
      default: 1,
    },
    incentivesProxyAdmin: {
      default: 1,
    },
    incentivesEmissionManager: {
      default: 0,
    },
    incentivesRewardsVault: {
      default: 2,
    },
  },
  external: {
    contracts: [
      {
        artifacts: "./temp-artifacts",
        deploy: "node_modules/@aave/deploy-v3/dist/deploy",
      },
    ],
  },
};

export default config;
