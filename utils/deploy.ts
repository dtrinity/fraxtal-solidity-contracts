import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  Addressable,
  BaseContract,
  InterfaceAbi,
  TransactionReceipt,
} from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ArtifactData, Libraries, ProxyOptions } from "hardhat-deploy/types";

/**
 * Deploy a contract with the given arguments
 * - The contract is deployed by the owner wallet
 *
 * @param hre - Hardhat Runtime Environment
 * @param deploymentName - The name of the contract to deploy
 * @param args - The arguments to pass to the contract constructor
 * @param gasLimit - The gas limit for the deployment
 * @param owner - The owner wallet's signer
 * @param linkLibraries - The libraries to link to the contract
 * @param contractPathOrArtifact - The path to the contract file (used in case having duplicated contract names in different directories) or the artifact data
 * @param proxy - The proxy options
 * @returns The deployment result
 */
export async function deployContract(
  hre: HardhatRuntimeEnvironment,
  deploymentName: string,
  args: any[],
  gasLimit: number | undefined,
  owner: HardhatEthersSigner,
  linkLibraries: Libraries | undefined = undefined,
  contractPathOrArtifact: string | ArtifactData | undefined = undefined,
  proxy: string | boolean | ProxyOptions | undefined = undefined,
): Promise<DeployContractResult> {
  console.log("-----------------");
  console.log(`Deploying '${deploymentName}' contract`);

  // The contract will be automatically found in contracts/**/*.sol
  const deployed = await hre.deployments.deploy(deploymentName, {
    // The owner wallet's address is used to pick the owner's account
    // The owner's accounts are specified in the hardhat.config.ts file
    from: owner.address,
    args: args,
    proxy: proxy,
    gasLimit: gasLimit,
    autoMine: true, // speed up deployment on local network (ganache, hardhat), no effect on live networks
    log: false, // We have our own logging below
    libraries: linkLibraries,
    contract: contractPathOrArtifact,
  });

  let deployedContract = await hre.ethers.getContractAt(
    deployed.abi,
    deployed.address,
    owner,
  );
  deployedContract = await deployedContract.waitForDeployment();

  if (deployed.receipt?.transactionHash === undefined) {
    console.log("  - deployed.receipt :", deployed.receipt);
    throw new Error("Transaction hash is undefined");
  }

  const receipt = await hre.ethers.provider.getTransactionReceipt(
    deployed.receipt?.transactionHash as string,
  );

  console.log("  - Address :", deployed.address);
  console.log("  - From    :", receipt?.from);
  console.log("  - TxHash  :", receipt?.hash);
  console.log("  - GasUsed :", receipt?.gasUsed.toString());
  console.log("-----------------");

  return {
    contract: deployedContract,
    receipt: receipt,
    address: deployed.address,
    abi: deployed.abi,
  };
}

export interface DeployContractResult {
  contract: BaseContract;
  receipt: TransactionReceipt | null | undefined;
  address: string | Addressable;
  abi?: InterfaceAbi;
}

/**
 * Get the default deploy script paths for the given environment variable postfix, based on the following environment variables:
 * - `DEPLOY_ONLY_DEX` (`true`/`false`)
 * - `DEPLOY_ONLY_LENDING` (`true`/`false`)
 * - `DEPLOY_DUSD` (`true`/`false`)
 * - `DEPLOY_DUSD_AMO_VAULT` (`true`/`false`)
 *
 * @returns The default deploy script paths
 */
export function getDefaultDeployScriptPaths(): string[] {
  // Note: By default it deploys everything, uncomment a path if we need to specifically deploy it and add the logic below
  const basePath = `deploy`;
  const localTokenPath = `deploy/00_local`;
  const dexPath = `deploy/01_dex`;
  // const oracleAggregatorPath = `deploy/02_oracle_aggregator`;
  const lendingPath = `deploy/03_lending`;
  // const liquidatorBotPath = `deploy/04_liquidator_bot`;
  const dusdPath = `deploy/05_dusd`;
  const dusdAmoVaultPath = `deploy/06_dusd_amo_vault`;
  // const dLoopPath = `deploy/07_dloop`;

  const isTrueBoolEnv = (envName: string): boolean => {
    if (!process.env[envName]) {
      return false;
    }

    if (process.env[envName] === "false") {
      return false;
    }

    if (process.env[envName] === "true") {
      return true;
    }
    throw new Error(`Invalid boolean value for ${envName}`);
  };

  const isOnlyDex = isTrueBoolEnv("DEPLOY_ONLY_DEX");
  const isOnlyLending = isTrueBoolEnv("DEPLOY_ONLY_LENDING");
  const isDeployDUSD = isTrueBoolEnv("DEPLOY_DUSD");
  const isDeployDusdAmoVault = isTrueBoolEnv("DEPLOY_DUSD_AMO_VAULT");

  if (isOnlyDex && isOnlyLending) {
    throw new Error(
      "Cannot set true for both DEPLOY_ONLY_DEX and DEPLOY_ONLY_LENDING environment variables",
    );
  }

  // If only one of the flags is set to true, deploy only that
  if (isOnlyDex) {
    return [localTokenPath, dexPath];
  }

  if (isOnlyLending) {
    return [localTokenPath, lendingPath];
  }

  // dUSD contracts can be deployed independently
  if (isDeployDUSD) {
    return [localTokenPath, dusdPath];
  }

  // Allow for deploying dUSD AMO vaults independently
  if (isDeployDusdAmoVault) {
    return [localTokenPath, dusdAmoVaultPath];
  }

  // Deploy everything by default
  return [basePath];
}
