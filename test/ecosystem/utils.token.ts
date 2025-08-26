import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { assert } from "chai";
import hre, { deployments, ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { AToken, MintableERC20 } from "../../typechain-types";
import { POOL_DATA_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { getReserveTokenAddresses } from "../../utils/lending/token";
import { fetchTokenInfoFromAddress, TokenInfo } from "../../utils/token";
import { getTokenContractForAddress } from "../../utils/utils";

/**
 * Get the token contract for the given symbol
 *
 * @param callerAddress Caller address
 * @param symbol Token symbol
 * @returns The token contract instance and token info
 */
export async function getTokenContractForSymbol(
  callerAddress: string,
  symbol: string,
): Promise<{ contract: MintableERC20; tokenInfo: TokenInfo }> {
  const signer = await ethers.getSigner(callerAddress);

  const tokenDeployment = await deployments.get(symbol);

  if (!tokenDeployment) {
    throw new Error(`Token deployment not found for symbol ${symbol}`);
  }
  const tokenaddress = tokenDeployment.address;

  const inputTokenInfo = await fetchTokenInfoFromAddress(tokenaddress);
  // Use the appropriate ABI per token. dUSD is AccessControl-enabled (upgradeable).
  const abiPath =
    symbol === "dUSD"
      ? "contracts/test/ERC20StablecoinUpgradeable.sol:ERC20StablecoinUpgradeable"
      : "contracts/dex/universal_router/test/MintableERC20.sol:MintableERC20";

  const contract = (await ethers.getContractAt(
    abiPath,
    tokenaddress,
    signer,
  )) as unknown as MintableERC20;

  return {
    contract: contract,
    tokenInfo: inputTokenInfo,
  };
}

/**
 * Returns the AToken contract for the given symbol
 *
 * @param callerAddress Caller address
 * @param symbol Corresponding reserve token symbol
 * @returns The token contract in AToken type
 */
export async function getATokenForSymbol(
  callerAddress: string,
  symbol: string,
): Promise<AToken> {
  const signer = await ethers.getSigner(callerAddress);
  const reservesAddresses = await getReserveTokenAddresses(hre);
  const dataProvider = await deployments.get(POOL_DATA_PROVIDER_ID);
  const dataProviderContract = await hre.ethers.getContractAt(
    "AaveProtocolDataProvider",
    dataProvider.address,
  );

  const { aTokenAddress } =
    await dataProviderContract.getReserveTokensAddresses(
      reservesAddresses[symbol],
    );

  const contract = (await ethers.getContractAt(
    "AToken",
    aTokenAddress,
    signer,
  )) as unknown as AToken;
  return contract;
}

/**
 * Transfer token to an account
 *
 * @param senderAddress - The address of the sender
 * @param receiverAddress - The address of the receiver
 * @param tokenSymbol - The symbol of the token
 * @param amount - The amount of the token to transfer
 */
export async function transferTokenToAccount(
  senderAddress: string,
  receiverAddress: string,
  tokenSymbol: string,
  amount: number,
): Promise<void> {
  const { tokenInfo } = await getTokenContractForSymbol(
    senderAddress,
    tokenSymbol,
  );

  await transferTokenToAccountFromAddress(
    senderAddress,
    receiverAddress,
    tokenInfo.address,
    amount,
  );
}

/**
 * Transfer token to an account from the token address
 *
 * @param senderAddress - The address of the sender
 * @param receiverAddress - The address of the receiver
 * @param tokenAddress - The address of the token
 * @param amount - The amount of the token to transfer
 */
export async function transferTokenToAccountFromAddress(
  senderAddress: string,
  receiverAddress: string,
  tokenAddress: string,
  amount: number,
): Promise<void> {
  const { contract, tokenInfo } = await getTokenContractForAddress(
    senderAddress,
    tokenAddress,
  );

  const parsedAmount = hre.ethers.parseUnits(
    amount.toString(),
    tokenInfo.decimals,
  );
  await contract.transfer(receiverAddress, parsedAmount);
}

/**
 * Get the balance of the token in its decimal form
 *
 * @param accountAddress - The address of the account
 * @param tokenSymbol - The symbol of the token
 * @returns The balance of the token in its decimal form
 */
export async function getTokenBalance(
  accountAddress: string,
  tokenSymbol: string,
): Promise<bigint> {
  const { tokenInfo } = await getTokenContractForSymbol(
    accountAddress,
    tokenSymbol,
  );
  return getTokenBalanceFromAddress(accountAddress, tokenInfo.address);
}

/**
 * Get the balance of the token in its decimal form from the token address
 *
 * @param accountAddress - The address of the account
 * @param tokenAddress - The address of the token
 * @returns - The balance of the token in its decimal form
 */
export async function getTokenBalanceFromAddress(
  accountAddress: string,
  tokenAddress: string,
): Promise<bigint> {
  const { contract } = await getTokenContractForAddress(
    accountAddress,
    tokenAddress,
  );
  return contract.balanceOf(accountAddress);
}

/**
 * Get the amount of the token in its decimal form
 *
 * @param amountString - The amount of the token
 * @param tokenSymbol - The symbol of the token
 * @returns - The amount of the token in its decimal form
 */
export async function getTokenAmount(
  amountString: string,
  tokenSymbol: string,
): Promise<bigint> {
  // Use getTokenAmountFromAddress
  const { dexDeployer } = await hre.getNamedAccounts();
  const { tokenInfo } = await getTokenContractForSymbol(
    dexDeployer,
    tokenSymbol,
  );
  return getTokenAmountFromAddress(amountString, tokenInfo.address);
}

/**
 * Get the amount of the token in its decimal form from the token address
 *
 * @param amountString - The amount of the token
 * @param tokenAddress - The address of the token
 * @returns - The amount of the token in its decimal form
 */
export async function getTokenAmountFromAddress(
  amountString: string,
  tokenAddress: string,
): Promise<bigint> {
  const tokenInfo = await fetchTokenInfoFromAddress(tokenAddress);
  return ethers.parseUnits(amountString, tokenInfo.decimals);
}

/**
 * Approve the token by symbol
 *
 * @param ownerAddress - The address of the owner
 * @param spenderAddress - The address of the spender
 * @param symbol - The symbol of the token
 * @param amount - The amount of the token to approve
 */
export async function approveTokenBySymbol(
  ownerAddress: string,
  spenderAddress: string,
  symbol: string,
  amount: number,
): Promise<void> {
  await (
    await getTokenContractForSymbol(ownerAddress, symbol)
  ).contract.approve(
    spenderAddress,
    await getTokenAmount(amount.toString(), symbol),
  );
}

/**
 * Approve the token by address, given the token follows ERC20 standard
 *
 * @param ownerAddress - The address of the owner
 * @param spenderAddress - The address of the spender
 * @param tokenAddress - The address of the token
 * @param amount - The amount of the token to approve
 */
export async function approveTokenByAddress(
  ownerAddress: string,
  spenderAddress: string,
  tokenAddress: string,
  amount: number,
): Promise<void> {
  await approveTokenByAddressRaw(
    ownerAddress,
    spenderAddress,
    tokenAddress,
    await getTokenAmountFromAddress(amount.toString(), tokenAddress),
  );
}

/**
 * Approve the token by address with the raw amount
 *
 * @param ownerAddress - The address of the owner
 * @param spenderAddress - The address of the spender
 * @param tokenAddress - The address of the token
 * @param amountRaw - The amount of the token to approve
 */
export async function approveTokenByAddressRaw(
  ownerAddress: string,
  spenderAddress: string,
  tokenAddress: string,
  amountRaw: bigint,
): Promise<void> {
  const contract = await hre.ethers.getContractAt(
    [
      "function approve(address spender, uint256 amount) external",
      "function symbol() external view returns (string)",
    ],
    tokenAddress,
    await hre.ethers.getSigner(ownerAddress),
  );
  const tx = await contract.approve(spenderAddress, amountRaw);
  await tx.wait();
}

/**
 * Assert the token balance of the owner
 *
 * @param ownerAddress - The address of the owner
 * @param symbol - The symbol of the token
 * @param expectedAmount - The expected amount of the token
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertTokenBalance(
  ownerAddress: string,
  symbol: string,
  expectedAmount: number,
  tolerance: number = 1e-6,
): Promise<void> {
  const { tokenInfo } = await getTokenContractForSymbol(ownerAddress, symbol);
  await assertTokenBalanceFromAddress(
    ownerAddress,
    tokenInfo.address,
    expectedAmount,
    tolerance,
  );
}

/**
 * Assert the token balance of the owner from the token address
 *
 * @param ownerAddress - The address of the owner
 * @param tokenAddress - The address of the token
 * @param expectedAmount - The expected amount of the token
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertTokenBalanceFromAddress(
  ownerAddress: string,
  tokenAddress: string,
  expectedAmount: number,
  tolerance: number = 1e-6,
): Promise<void> {
  const { contract, tokenInfo } = await getTokenContractForAddress(
    ownerAddress,
    tokenAddress,
  );
  const balance = await contract.balanceOf(ownerAddress);
  const actualBalance = Number(ethers.formatUnits(balance, tokenInfo.decimals));
  assert.approximately(
    actualBalance,
    expectedAmount,
    tolerance * expectedAmount,
  );
}

/**
 * Assert the token balance of the owner in its decimal form.
 *
 * @param ownerAddress - The address of the owner
 * @param symbol - The symbol of the token
 * @param expectedTokenAmount - The expected amount of the token in token amount (1e6 means 1 dUSD)
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertTokenBalanceBigInt(
  ownerAddress: string,
  symbol: string,
  expectedTokenAmount: bigint,
  tolerance: number = 1e-6,
): Promise<void> {
  const { tokenInfo } = await getTokenContractForSymbol(ownerAddress, symbol);
  await assertTokenBalanceBigIntFromAddress(
    ownerAddress,
    tokenInfo.address,
    expectedTokenAmount,
    tolerance,
  );
}

/**
 * Assert the token balance of the owner in its decimal form from the token address
 *
 * @param ownerAddress - The address of the owner
 * @param tokenAddress - The address of the token
 * @param expectedTokenAmount - The expected amount of the token in token amount (1e6 means 1 dUSD)
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertTokenBalanceBigIntFromAddress(
  ownerAddress: string,
  tokenAddress: string,
  expectedTokenAmount: bigint,
  tolerance: number = 1e-6,
): Promise<void> {
  const { contract } = await getTokenContractForAddress(
    ownerAddress,
    tokenAddress,
  );
  const actualBalance = await contract.balanceOf(ownerAddress);

  const toleranceBigInt = BigInt(
    Math.floor(Number(expectedTokenAmount) * tolerance),
  );

  assert(
    actualBalance >= expectedTokenAmount - toleranceBigInt &&
      actualBalance <= expectedTokenAmount + toleranceBigInt,
    `Token balance for ${tokenAddress} is not within tolerance. Expected: ${expectedTokenAmount}, Actual: ${actualBalance}`,
  );
}

/**
 * Fill up the account balance with the token using fund from the dexDeployer
 *
 * @param receiverAddress - The address of the receiver
 * @param tokenSymbol - The symbol of the token
 * @param amount - The amount of the token to transfer
 */
export async function fillUpAccountBalance(
  receiverAddress: string,
  tokenSymbol: string,
  amount: number,
): Promise<void> {
  const { tokenInfo } = await getTokenContractForSymbol(
    receiverAddress,
    tokenSymbol,
  );
  await fillUpAccountBalanceFromAddress(
    receiverAddress,
    tokenInfo.address,
    amount,
  );
}

/**
 * Fill up the account balance with the token (with the token address) using fund from the dexDeployer
 *
 * @param receiverAddress - The address of the receiver
 * @param tokenAddress - The address of the token
 * @param amount - The amount of the token to transfer
 */
export async function fillUpAccountBalanceFromAddress(
  receiverAddress: string,
  tokenAddress: string,
  amount: number,
): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const { contract } = await getTokenContractForAddress(
    dexDeployer,
    tokenAddress,
  );
  contract.transfer(
    receiverAddress,
    await getTokenAmountFromAddress(amount.toString(), tokenAddress),
  );
}

/**
 * Fill up the account balance with the token using fund from the whale
 * - It is used for the mainnet fork
 *
 * @param whaleSigner - The signer of the whale
 * @param receiverAddress - The address of the receiver
 * @param tokenAddress - The address of the token
 * @param amount - The amount of the token to transfer
 */
export async function fillUpAccountBalanceFromAddressWithWhale(
  whaleSigner: HardhatEthersSigner,
  receiverAddress: string,
  tokenAddress: string,
  amount: number,
): Promise<void> {
  const contract = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    tokenAddress,
    whaleSigner,
  );

  await contract.transfer(
    receiverAddress,
    await getTokenAmountFromAddress(amount.toString(), tokenAddress),
  );
}

/**
 * Mint ERC4626 tokens to receivers
 *
 * @param hre - Hardhat runtime environment
 * @param vaultTokenAddress - The address of the vault token
 * @param mintAmount - Object mapping receiver addresses to mint amounts
 * @param owner - The address of the contract owner
 */
export async function mintERC4626Token(
  hre: HardhatRuntimeEnvironment,
  vaultTokenAddress: string,
  mintAmount: {
    [receiverAddress: string]: number;
  },
  owner: string,
): Promise<void> {
  const vaultTokenContract = await hre.ethers.getContractAt(
    "contracts/token/MockERC4626Token.sol:MockERC4626Token",
    vaultTokenAddress,
    await hre.ethers.getSigner(owner),
  );

  const underlyingAssetAddress = await vaultTokenContract.asset();

  const underlyingTokenContract = await hre.ethers.getContractAt(
    "@openzeppelin/contracts-5/token/ERC20/ERC20.sol:ERC20",
    underlyingAssetAddress,
    await hre.ethers.getSigner(owner),
  );

  // Mint some tokens to the deployer
  for (const [receiverAddress, amount] of Object.entries(mintAmount)) {
    // Approve maximum amount to the vault token contract
    await underlyingTokenContract.approve(vaultTokenAddress, ethers.MaxUint256);

    // Mint will be done by getting some underlying asset from the caller and send the shares to the receiver
    await vaultTokenContract.mint(
      await getTokenAmountFromAddress(amount.toString(), vaultTokenAddress),
      receiverAddress,
    );
  }
}
