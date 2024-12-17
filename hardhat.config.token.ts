import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "dotenv/config";

import { HardhatUserConfig } from "hardhat/config";

import { getDefaultSolidityCompilersConfig } from "./utils/hardhat-config/compilers";
import {
  getDefaultNamedAccounts,
  getDefaultPrivateKeys,
} from "./utils/hardhat-config/named_accounts";

/**
 * We separate the configuration for the test tokens deployment from the default
 * configuration to avoid conflicts re-deploying the tokens when running the `make deploy-contract.<network>.reset`
 * - We only want the core contracts to be re-deployed when running the reset command and not the test tokens
 */

/* eslint-disable camelcase -- Use camelcase for network config  */
const config: HardhatUserConfig = {
  solidity: getDefaultSolidityCompilersConfig(),
  networks: {
    localhost: {
      saveDeployments: true,
    },
    fraxtal_testnet: {
      url: "https://rpc.testnet.frax.com",
      saveDeployments: true,
      accounts: getDefaultPrivateKeys("fraxtal_testnet"),
    },
  },
  paths: {
    sources: "./contracts/test",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deployments: "./deployments/test-tokens",
  },
  namedAccounts: getDefaultNamedAccounts(),
};
/* eslint-enable camelcase -- Use camelcase for network config */

export default config;
