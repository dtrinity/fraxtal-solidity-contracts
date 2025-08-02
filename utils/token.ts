import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BigNumberish, ContractTransactionReceipt } from "ethers";
import hre, { ethers, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../config/config";
import { MintConfig } from "../config/types";
import { deployContract, DeployContractResult } from "./deploy";
import { getTokenRegistry, TokenDeploymentStrategy } from "./token-registry";
import { isLocalNetwork, isTestnetNetwork } from "./utils";

export interface DeployTestTokenResult {
  Tokens: { [symbol: string]: DeployContractResult };
  Account: {
    Owner: HardhatEthersSigner;
    ToAddresses: string[];
  };
}

/**
 * Get the test token symbols
 *
 * @param hre - Hardhat Runtime Environment
 * @returns The test token symbols
 */
export async function getTestTokenSymbols(
  hre: HardhatRuntimeEnvironment,
): Promise<string[]> {
  if (isLocalNetwork(hre.network.name)) {
    const registry = await getTokenRegistry(hre);
    // Get all symbols that have MINT strategy
    return Object.values(registry.tokens)
      .filter(token => token.strategy === TokenDeploymentStrategy.MINT)
      .map(token => token.symbol);
  }
  throw new Error(
    `Test token symbols are not available on network ${hre.network.name}`,
  );
}

/**
 * Deploy the test tokens with default contract owner
 *
 * @param hre - Hardhat Runtime Environment
 * @param mintAmounts - The mint amounts for the tokens to each toAddress with the corresponding amount
 * @returns The deployment result with the deployed contract information
 */
export async function deployTokensDefault(
  hre: HardhatRuntimeEnvironment,
  mintAmounts: {
    [tokenSymbol: string]: MintConfig[];
  },
): Promise<DeployTestTokenResult> {
  const { testTokenDeployer } = await hre.getNamedAccounts();
  return deployTestTokens(
    hre,
    mintAmounts,
    await hre.ethers.getSigner(testTokenDeployer),
  );
}

/**
 * Deploy the test tokens (only for localhost)
 *
 * @param hre - Hardhat Runtime Environment
 * @param mintAmounts - The mint amounts for the tokens to each toAddress with the corresponding amount
 * @param deployer - The deployer signer
 * @param decimals - The token decimals, defaults to 18
 * @returns The deployment result with the deployed contract information
 */
export async function deployTestTokens(
  hre: HardhatRuntimeEnvironment,
  mintAmounts: {
    [tokenSymbol: string]: MintConfig[];
  },
  deployer: HardhatEthersSigner,
  decimals: number = 18,
): Promise<DeployTestTokenResult> {
  if (
    !isLocalNetwork(hre.network.name) &&
    !isTestnetNetwork(hre.network.name)
  ) {
    throw new Error(
      `This function should only be called on testnet, localhost or hardhat local network: ${hre.network.name}`,
    );
  }

  console.log("Deploying test tokens");

  // Deploy the test tokens and mint some tokens to some accounts
  // - The other owner will have half of the owner's balance
  const deployedTokenResults: DeployContractResult[] = [];
  const deployedTokenResultsMap: { [symbol: string]: DeployContractResult } =
    {};

  let receiverAddresses: string[] = [];

  for (const tokenSymbol of Object.keys(mintAmounts)) {
    const tokenMintAmounts = mintAmounts[tokenSymbol];
    receiverAddresses.push(
      ...mintAmounts[tokenSymbol].map((mintAmount) => mintAmount.toAddress),
    );

    const deployedResult = await deployTestTokenAndMint(
      hre,
      tokenSymbol,
      deployer,
      tokenMintAmounts,
      decimals,
    );
    deployedTokenResults.push(deployedResult);
    deployedTokenResultsMap[tokenSymbol] = deployedResult;
  }

  // Make receiverAddresses unique
  receiverAddresses = [...new Set(receiverAddresses)];
  // Sort the addresses
  receiverAddresses = receiverAddresses.sort((a, b) => {
    return a.localeCompare(b);
  });

  // Print a space line to separate the output
  console.log("");

  // Check balance
  console.log("Checking balances after deployment");
  await checkTestTokenBalances(hre, deployedTokenResults, receiverAddresses);

  return {
    Tokens: deployedTokenResultsMap,
    Account: {
      Owner: deployer,
      ToAddresses: receiverAddresses,
    },
  };
}

const ERC20TestContractPath = "contracts/test/ERC20Test.sol:ERC20Test";

/**
 * Deploy the test token and mint some tokens to the owner
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokenSymbol - The token symbol
 * @param contractOwner - The contract owner
 * @param mintAmounts - The mint amounts to the accounts
 * @param decimals - The token decimals, defaults to 18
 * @returns The deployment result with the deployed contract information
 */
async function deployTestTokenAndMint(
  hre: HardhatRuntimeEnvironment,
  tokenSymbol: string,
  contractOwner: HardhatEthersSigner,
  mintAmounts: MintConfig[],
  decimals: number = 18,
): Promise<DeployContractResult> {
  // It will use the contract at ERC20TestContractPath to deploy the token
  // The artifact will be named as the tokenContractName
  const deployedResult = await deployContract(
    hre,
    tokenSymbol,
    [tokenSymbol, decimals],
    undefined, // auto-filling gas limit
    contractOwner,
    undefined, // no libraries
    ERC20TestContractPath,
  );

  const tokenInfo = await fetchTokenInfo(
    hre,
    deployedResult.address.toString(),
  );

  for (const mintConfig of mintAmounts) {
    await mintTestToken(
      hre,
      deployedResult.address.toString(),
      contractOwner,
      mintConfig.toAddress,
      mintConfig.amount,
      tokenInfo.decimals,
    );
  }

  return {
    address: deployedResult.address,
    contract: deployedResult.contract,
    receipt: deployedResult.receipt,
  };
}

/**
 * Mint some test tokens to an account
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokenAddress - The token address
 * @param contractOwner - The token contract owner
 * @param accountAddress - The account address
 * @param mintAmount - The amount to mint
 * @param decimals - The token decimals
 */
export async function mintTestToken(
  hre: HardhatRuntimeEnvironment,
  tokenAddress: string,
  contractOwner: HardhatEthersSigner,
  accountAddress: string,
  mintAmount: BigNumberish,
  decimals: number,
): Promise<void> {
  // Convert the mint amount to the token amount
  // Example: 1 USDT = 1e6 (6 decimals)
  const tokenAmount = ethers.parseUnits(mintAmount.toString(), decimals);

  // It will use the contract at ERC20TestContractPath for the ABI reference
  const contract = await hre.ethers.getContractAt(
    ERC20TestContractPath,
    tokenAddress,
    contractOwner,
  );
  await contract.mint(accountAddress, tokenAmount);
}

/**
 * Get the ERC-20 token balance of an account
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokenAddress - The token address
 * @param accountAddress - The account address
 * @returns The balance of the account
 */
export async function getERC20TokenBalance(
  hre: HardhatRuntimeEnvironment,
  tokenAddress: string,
  accountAddress: string,
): Promise<bigint> {
  const contract = await hre.ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)"],
    tokenAddress,
  );
  return await contract.balanceOf(accountAddress);
}

/**
 * Check the test token balances for the accounts
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokens - The tokens to check
 * @param accountAddresses - The account addresses
 */
async function checkTestTokenBalances(
  hre: HardhatRuntimeEnvironment,
  tokens: DeployContractResult[],
  accountAddresses: string[],
): Promise<void> {
  const tokenInfoMap = new Map<string, TokenInfo>();

  for (const token of tokens) {
    const tokenInfo = await fetchTokenInfo(hre, token.address.toString());
    tokenInfoMap.set(token.address.toString(), tokenInfo);
  }

  for (const accountAddress of accountAddresses) {
    console.log("-----------------");
    console.log(`  Account ${accountAddress}`);

    for (const token of tokens) {
      const tokenAddress = token.address.toString();
      const tokenInfo = tokenInfoMap.get(tokenAddress);

      if (!tokenInfo) {
        throw new Error(`Token info not found for ${tokenAddress}`);
      }
      const balanceRaw = await getERC20TokenBalance(
        hre,
        tokenAddress,
        accountAddress,
      );
      const balance = ethers.formatUnits(
        balanceRaw.toString(),
        tokenInfo?.decimals,
      );
      console.log(
        `   + ${token.address} - ${tokenInfo?.symbol}: ${balance} (${balanceRaw})`,
      );
    }
  }

  console.log("-----------------");
}

/**
 * Approve token allowance for a spender
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokenAddress - The token address
 * @param owner - The owner wallet's signer
 * @param spender - The spender address (who will be delegated to spend the token)
 * @param amount - The amount to approve
 * @returns The transaction receipt
 */
export async function approveTokenAllowance(
  hre: HardhatRuntimeEnvironment,
  tokenAddress: string,
  owner: HardhatEthersSigner,
  spender: string,
  amount: BigNumberish,
): Promise<ContractTransactionReceipt | null> {
  // It will use the contract at ERC20TestContractPath for the ABI reference
  const contract = await hre.ethers.getContractAt(
    ERC20TestContractPath,
    tokenAddress,
    owner,
  );
  const res = await contract.approve(spender, amount);
  return await res.wait();
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

const tokenInfoCache = new Map<string, TokenInfo>();

/**
 * Fetch the token information from blockchain given the token address
 * - It will cache the token information to avoid fetching the same token information multiple times
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokenAddress - The token address
 * @returns The token information
 */
export async function fetchTokenInfo(
  hre: HardhatRuntimeEnvironment,
  tokenAddress: string,
): Promise<TokenInfo> {
  if (tokenInfoCache.has(tokenAddress)) {
    return tokenInfoCache.get(tokenAddress) as TokenInfo;
  }
  const tokenInfo = await fetchTokenInfoImplementation(hre, tokenAddress);
  tokenInfoCache.set(tokenAddress, tokenInfo);
  return tokenInfo;
}

/**
 * Fetch the token information from blockchain given the token address
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokenAddress - The token address
 * @returns - The token information
 */
async function fetchTokenInfoImplementation(
  hre: HardhatRuntimeEnvironment,
  tokenAddress: string,
): Promise<TokenInfo> {
  const { dexDeployer } = await getNamedAccounts();

  const tokenContract = new hre.ethers.Contract(
    tokenAddress,
    // ERC20 ABI for getting the token information
    [
      "function symbol() view returns (string)",
      "function name() view returns (string)",
      "function decimals() view returns (uint8)",
    ],
    await hre.ethers.getSigner(dexDeployer), // It is required to have a signer to call the contract
  );

  return {
    address: tokenAddress,
    symbol: await tokenContract.symbol(),
    name: await tokenContract.name(),
    decimals: Number(await tokenContract.decimals()),
  };
}

/**
 * Fetch the token information from blockchain given the token address with a default Hardhat Runtime Environment
 *
 * @param tokenAddress - The token address
 * @returns The token information
 */
export async function fetchTokenInfoFromAddress(
  tokenAddress: string,
): Promise<TokenInfo> {
  return fetchTokenInfo(hre, tokenAddress);
}

/**
 * Get the token amount in the smallest unit from the token address
 * - ie. 1 USDT = 1e6 (6 decimals)
 *
 * @param tokenAddress - The token address
 * @param amount - The amount to convert
 * @returns - The token amount in the smallest unit
 */
export async function getTokenAmountFromAddress(
  tokenAddress: string,
  amount: BigNumberish,
): Promise<bigint> {
  const tokenInfo = await fetchTokenInfo(hre, tokenAddress);
  return ethers.parseUnits(amount.toString(), tokenInfo.decimals);
}

/**
 * Convert a list of token symbols to a list of token addresses
 *
 * @param symbols - The list of token symbols
 * @param TOKEN_INFO - The mapping of token symbols to token info containing addresses
 * @returns The list of token addresses
 */
export function symbolsToAddresses(
  symbols: string[],
  TOKEN_INFO: {
    [symbol: string]: { address: string };
  },
): string[] {
  return symbols.map(
    (symbol) => TOKEN_INFO[symbol as keyof typeof TOKEN_INFO].address,
  );
}
