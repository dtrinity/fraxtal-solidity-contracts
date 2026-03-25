import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "dotenv/config";

import { HardhatUserConfig } from "hardhat/config";

import { getDefaultDeployScriptPaths } from "./utils/deploy";
import { getDefaultSolidityCompilersConfig } from "./utils/hardhat-config/compilers";
import { getDefaultNamedAccounts, getDefaultPrivateKeys } from "./utils/hardhat-config/named_accounts";

const etherscanApiKey = process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: getDefaultSolidityCompilersConfig(),
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      saveDeployments: false, // allow testing without needing to remove the previous deployments
      // Uncomment this if you want to run Curve related tests against hardhat which is much faster than local_ethereum
      // forking: {
      //   url: "https://mainnet.infura.io/v3/9c52fc4e27554e868b243c18bf9631c7",
      //   blockNumber: 20812145,
      // },
    },
    localhost: {
      deploy: getDefaultDeployScriptPaths(),
      saveDeployments: true,
    },
    fraxtal_testnet: {
      url: "https://rpc.testnet.frax.com",
      deploy: getDefaultDeployScriptPaths(),
      saveDeployments: true,
      accounts: getDefaultPrivateKeys("fraxtal_testnet"),
    },
    fraxtal_mainnet: {
      url: "https://rpc.frax.com",
      deploy: getDefaultDeployScriptPaths(),
      saveDeployments: true,
      accounts: getDefaultPrivateKeys("fraxtal_mainnet"),
    },
    local_ethereum: {
      url: "http://127.0.0.1:8545",
      allowUnlimitedContractSize: true,
      saveDeployments: false,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deployments: "./deployments",
    deploy: "./deploy",
  },
  namedAccounts: getDefaultNamedAccounts(),
  etherscan: {
    apiKey: {
      fraxtal_mainnet: etherscanApiKey,
      fraxtal_testnet: etherscanApiKey,
    },
    customChains: [
      {
        network: "fraxtal_mainnet",
        chainId: 252,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=252",
          browserURL: "https://fraxscan.com",
        },
      },
      {
        network: "fraxtal_testnet",
        chainId: 2522,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=2523",
          browserURL: "https://hoodi.fraxscan.com",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  mocha: {
    timeout: 120_000, // 2 min per test for deployment-heavy suites on CI
  },
};

export default config;
