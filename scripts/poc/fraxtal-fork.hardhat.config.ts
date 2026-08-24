import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "dotenv/config";

import { HardhatUserConfig } from "hardhat/config";

import { getDefaultSolidityCompilersConfig } from "../../utils/hardhat-config/compilers";

const forkUrl = process.env.FRAXTAL_RPC_URL ?? "https://rpc.frax.com";
const forkBlockEnv = process.env.FRAXTAL_FORK_BLOCK;
const forkBlock = forkBlockEnv ? Number(forkBlockEnv) : undefined;

const config: HardhatUserConfig = {
  solidity: getDefaultSolidityCompilersConfig(),
  networks: {
    hardhat: {
      chainId: 252,
      allowUnlimitedContractSize: true,
      blockGasLimit: 30_000_000,
      forking: {
        url: forkUrl,
        ...(Number.isFinite(forkBlock) ? { blockNumber: forkBlock } : {}),
      },
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
};

export default config;
