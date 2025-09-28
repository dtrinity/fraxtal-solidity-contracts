import { assert } from "chai";
import hre from "hardhat";

import { TokenSupplyManager, TokenSupplyManagerHarness } from "../../typechain-types";
import { getTokenAmount, getTokenBalance, getTokenContractForSymbol } from "../ecosystem/utils.token";

/**
 * Get the TokenSupplyManager contract
 *
 * @param callerAddress - The address of the caller
 * @returns The TokenSupplyManager contract
 */
export async function getTokenSupplyManagerContract(callerAddress: string): Promise<TokenSupplyManager> {
  const contract = await hre.deployments.get("TokenSupplyManager");
  const tokenSupplyManagerContract = await hre.ethers.getContractAt(
    "TokenSupplyManager",
    contract.address,
    await hre.ethers.getSigner(callerAddress),
  );
  return tokenSupplyManagerContract;
}

/**
 * Get the TokenSupplyManagerHarness contract (for testing private functions of TokenSupplyManager)
 *
 * @param callerAddress - The address of the caller
 * @returns The TokenSupplyManagerHarness contract
 */
export async function getTokenSupplyManagerHarnessContract(callerAddress: string): Promise<TokenSupplyManagerHarness> {
  const contract = await hre.deployments.get("TokenSupplyManagerHarness");
  const tokenSupplyManagerContract = await hre.ethers.getContractAt(
    "TokenSupplyManagerHarness",
    contract.address,
    await hre.ethers.getSigner(callerAddress),
  );
  return tokenSupplyManagerContract;
}

/**
 * Assert the balance of a token
 *
 * @param callerAddress - The address of the caller
 * @param tokenSymbol - The symbol of the token
 * @param amount - The amount to assert (in string format, e.g. "100" DUSD)
 */
export async function assertBalance(callerAddress: string, tokenSymbol: string, amount: string): Promise<void> {
  assert.equal(await getTokenBalance(callerAddress, tokenSymbol), await getTokenAmount(amount, tokenSymbol));
}

/**
 * Issue the receipt token from the collateral token with approval
 *
 * @param callerAddress - The address of the caller
 * @param collateralSymbol - The symbol of the collateral token
 * @param receiptSymbol - The symbol of the receipt token
 * @param depositAmount - The amount to deposit
 */
export async function issueWithApproval(
  callerAddress: string,
  collateralSymbol: string,
  receiptSymbol: string,
  depositAmount: number,
): Promise<void> {
  const supplyManager = await getTokenSupplyManagerContract(callerAddress);
  const { contract: collateralContract } = await getTokenContractForSymbol(callerAddress, collateralSymbol);

  const collateralTokenBalanceBefore = await getTokenBalance(callerAddress, collateralSymbol);
  const receiptTokenBalanceBefore = await getTokenBalance(callerAddress, receiptSymbol);

  await collateralContract.approve(await supplyManager.getAddress(), await getTokenAmount(depositAmount.toString(), collateralSymbol));

  await supplyManager.issue(callerAddress, await getTokenAmount(depositAmount.toString(), collateralSymbol));

  const collateralTokenBalanceAfter = await getTokenBalance(callerAddress, collateralSymbol);
  const receiptTokenBalanceAfter = await getTokenBalance(callerAddress, receiptSymbol);

  const depositAmountBigInt = await getTokenAmount(depositAmount.toString(), collateralSymbol);
  const receiptAmountBigInt = await getTokenAmount(depositAmount.toString(), receiptSymbol);

  // Make sure the balance is decreased after depositing and the receipt token balance is increased
  assert.equal(collateralTokenBalanceBefore - depositAmountBigInt, collateralTokenBalanceAfter);
  assert.equal(receiptTokenBalanceBefore + receiptAmountBigInt, receiptTokenBalanceAfter);
}

/**
 * Redeem the receipt token to the collateral token with approval
 *
 * @param callerAddress - The address of the caller
 * @param collateralSymbol - The symbol of the collateral token
 * @param receiptSymbol - The symbol of the receipt token
 * @param redeemAmount - The amount to redeem
 */
export async function redeemWithApproval(
  callerAddress: string,
  collateralSymbol: string,
  receiptSymbol: string,
  redeemAmount: number,
): Promise<void> {
  const supplyManager = await getTokenSupplyManagerContract(callerAddress);
  const { contract: receiptContract } = await getTokenContractForSymbol(callerAddress, receiptSymbol);

  const collateralTokenBalanceBefore = await getTokenBalance(callerAddress, collateralSymbol);
  const receiptTokenBalanceBefore = await getTokenBalance(callerAddress, receiptSymbol);

  await receiptContract.approve(await supplyManager.getAddress(), await getTokenAmount(redeemAmount.toString(), receiptSymbol));

  await supplyManager.redeem(callerAddress, await getTokenAmount(redeemAmount.toString(), receiptSymbol));

  const collateralTokenBalanceAfter = await getTokenBalance(callerAddress, collateralSymbol);
  const receiptTokenBalanceAfter = await getTokenBalance(callerAddress, receiptSymbol);

  const redeemAmountBigInt = await getTokenAmount(redeemAmount.toString(), receiptSymbol);
  const collateralAmountBigInt = await getTokenAmount(redeemAmount.toString(), collateralSymbol);

  // Make sure the balance is increased after redeeming and the receipt token balance is decreased
  assert.equal(collateralTokenBalanceBefore + collateralAmountBigInt, collateralTokenBalanceAfter);
  assert.equal(receiptTokenBalanceBefore - redeemAmountBigInt, receiptTokenBalanceAfter);
}
