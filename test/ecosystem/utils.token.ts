import hre, { deployments, ethers } from "hardhat";

import { AToken, MintableERC20 } from "../../typechain-types";
import { POOL_DATA_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { getReserveTokenAddresses } from "../../utils/lending/token";
import { fetchTokenInfoFromAddress, TokenInfo } from "../../utils/token";

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
  const contract = (await ethers.getContractAt(
    "contracts/dex/universal_router/test/MintableERC20.sol:MintableERC20",
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
  const { contract, tokenInfo } = await getTokenContractForSymbol(
    senderAddress,
    tokenSymbol,
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
  const { contract } = await getTokenContractForSymbol(
    accountAddress,
    tokenSymbol,
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
  const { dexDeployer } = await hre.getNamedAccounts();
  const { tokenInfo } = await getTokenContractForSymbol(
    dexDeployer,
    tokenSymbol,
  );

  return ethers.parseUnits(amountString, tokenInfo.decimals);
}
