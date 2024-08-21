import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "dotenv/config";

import { HardhatUserConfig } from "hardhat/config";

import {
  getDefaultNamedAccounts,
  getDefaultPrivateKeys,
} from "./utils/account";
import { getDefaultSolidityCompilersConfig } from "./utils/compilers";
import { getDefaultDeployScriptPaths } from "./utils/deploy";

/* eslint-disable camelcase -- Use camelcase for network config  */
const config: HardhatUserConfig = {
  solidity: getDefaultSolidityCompilersConfig(),
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      saveDeployments: false, // allow testing without needing to remove the previous deployments
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
};
/* eslint-enable camelcase -- Use camelcase for network config */

export default config;
