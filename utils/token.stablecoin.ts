import { BigNumberish } from "@ethersproject/bignumber";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { MintConfig } from "../config/types";
import { deployContract, DeployContractResult } from "./deploy";
import { DeployTestTokenResult, fetchTokenInfo, TokenInfo } from "./token";
import { isLocalNetwork, isTestnetNetwork } from "./utils";

const ERC20StablecoinUpgradeableContractPath =
  "contracts/test/ERC20StablecoinUpgradeable.sol:ERC20StablecoinUpgradeable";

/**
 * Deploy the test tokens (only for localhost)
 *
 * @param hre - Hardhat Runtime Environment
 * @param mintAmounts - The mint amounts for the tokens to each toAddress with the corresponding amount
 * @param deployer - The deployer signer
 * @returns The deployment result with the deployed contract information
 */
export async function deployTestERC20StablecoinUpgradeableTokens(
  hre: HardhatRuntimeEnvironment,
  mintAmounts: {
    [tokenSymbol: string]: MintConfig[];
  },
  deployer: HardhatEthersSigner,
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

    const deployedResult =
      await deployTestERC20StablecoinUpgradeableTokenAndMint(
        hre,
        tokenSymbol,
        deployer,
        deployer, // The deployer is also the minter
        tokenMintAmounts,
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
  await checkTestERC20StablecoinUpgradeableTokenBalances(
    hre,
    deployedTokenResults,
    receiverAddresses,
  );

  return {
    Tokens: deployedTokenResultsMap,
    Account: {
      Owner: deployer,
      ToAddresses: receiverAddresses,
    },
  };
}

/**
 * Deploy a test ERC20StablecoinUpgradeable token and mint some tokens to some accounts
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokenSymbol - The token symbol
 * @param contractOwner - The contract owner
 * @param contractMinter - The contract minter
 * @param mintAmounts - The mint amounts for the tokens to each toAddress with the corresponding amount
 * @returns The deployment result with the deployed contract information
 */
async function deployTestERC20StablecoinUpgradeableTokenAndMint(
  hre: HardhatRuntimeEnvironment,
  tokenSymbol: string,
  contractOwner: HardhatEthersSigner,
  contractMinter: HardhatEthersSigner,
  mintAmounts: MintConfig[],
): Promise<DeployContractResult> {
  // It will use the contract at contracts/test/ERC20StablecoinUpgradeable.sol to deploy the token
  // The artifact will be named as the tokenContractName
  const deployedResult = await deployContract(
    hre,
    tokenSymbol,
    [],
    undefined, // auto-filling gas limit
    contractOwner,
    undefined, // no libraries
    ERC20StablecoinUpgradeableContractPath,
    {
      execute: {
        init: {
          methodName: "initialize",
          args: ["Test" + tokenSymbol, tokenSymbol],
        },
      },
      proxyContract: "OpenZeppelinTransparentProxy",
    },
  );

  // Set minter role
  const contract = await hre.ethers.getContractAt(
    "ERC20StablecoinUpgradeable",
    deployedResult.address.toString(),
  );
  contract.grantRole(await contract.MINTER_ROLE(), contractMinter.address);

  for (const mintConfig of mintAmounts) {
    await mintTestERC20StablecoinUpgradeableToken(
      hre,
      deployedResult.address.toString(),
      contractOwner,
      mintConfig.toAddress,
      mintConfig.amount,
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
 */
export async function mintTestERC20StablecoinUpgradeableToken(
  hre: HardhatRuntimeEnvironment,
  tokenAddress: string,
  contractOwner: HardhatEthersSigner,
  accountAddress: string,
  mintAmount: BigNumberish,
): Promise<void> {
  const tokenInfo = await fetchTokenInfo(hre, tokenAddress.toString());
  // Convert the mint amount to the token amount
  // Example: 1 USDT = 1e6 (6 decimals)
  const tokenAmount = ethers.parseUnits(
    mintAmount.toString(),
    tokenInfo.decimals,
  );

  // It will use the contract at ERC20TestContractPath for the ABI reference
  const contract = await hre.ethers.getContractAt(
    ERC20StablecoinUpgradeableContractPath,
    tokenAddress,
    contractOwner,
  );
  await contract.mint(accountAddress, tokenAmount);
}

/**
 * Get the ERC20StablecoinUpgradeable token balance of an account
 *
 * @param hre - Hardhat Runtime Environment
 * @param tokenAddress - The token address
 * @param accountAddress - The account address
 * @returns The balance of the account
 */
export async function getERC20StablecoinUpgradeableTokenBalance(
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
async function checkTestERC20StablecoinUpgradeableTokenBalances(
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
      const balanceRaw = await getERC20StablecoinUpgradeableTokenBalance(
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
