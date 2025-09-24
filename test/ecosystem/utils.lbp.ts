import { assert } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

import { getUserDebtBalance, getUserSupplyBalance } from "../../utils/lending/balance";
import { INTEREST_RATE_MODE_VARIABLE } from "../../utils/lending/constants";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../utils/lending/deploy-ids";
import { getTokenAmountFromAddress } from "../../utils/token";
import { getTokenContractForAddress } from "../../utils/utils";

/**
 * Deposit collateral into the LBP pool
 *
 * @param callerAddress Address of the caller
 * @param depositTokenAddress Address of the deposit token
 * @param depositAmount Amount of deposit token to deposit
 * @returns The transaction response
 */
export async function depositCollateralWithApproval(
  callerAddress: string,
  depositTokenAddress: string,
  depositAmount: number,
): Promise<void> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const { contract: collateralToken, tokenInfo: depositTokenInfo } = await getTokenContractForAddress(callerAddress, depositTokenAddress);

  const addressProviderDeployedResult = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressProviderContract = await hre.ethers.getContractAt("PoolAddressesProvider", addressProviderDeployedResult.address, signer);

  const poolAddress = await addressProviderContract.getPool();

  await collateralToken.approve(poolAddress, ethers.MaxUint256);

  const poolContract = await hre.ethers.getContractAt("Pool", poolAddress, signer);

  const depositAmountOnChainInt = ethers.parseUnits(depositAmount.toString(), depositTokenInfo.decimals);

  const depositTxn = await poolContract.supply(
    depositTokenAddress,
    depositAmountOnChainInt,
    callerAddress,
    0, // No referral code
  );

  const depositResponse = await depositTxn.wait();

  if (depositResponse?.status !== 1) {
    throw new Error("Deposit failed");
  }
}

/**
 * Borrow an asset from the LBP
 *
 * @param callerAddress Address of the caller
 * @param borrowTokenAddress Address of the borrow token
 * @param borrowAmount Amount of borrow token to borrow
 */
export async function borrowAsset(callerAddress: string, borrowTokenAddress: string, borrowAmount: number): Promise<void> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const { tokenInfo: borrowTokenInfo } = await getTokenContractForAddress(callerAddress, borrowTokenAddress);

  const addressProviderDeployedResult = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressProviderContract = await hre.ethers.getContractAt("PoolAddressesProvider", addressProviderDeployedResult.address, signer);

  const poolAddress = await addressProviderContract.getPool();

  const poolContract = await hre.ethers.getContractAt("Pool", poolAddress, signer);

  const borrowAmountOnChainInt = ethers.parseUnits(borrowAmount.toString(), borrowTokenInfo.decimals);

  const borrowTxn = await poolContract.borrow(borrowTokenAddress, borrowAmountOnChainInt, INTEREST_RATE_MODE_VARIABLE, 0, callerAddress);

  const borrowResponse = await borrowTxn.wait();

  if (borrowResponse?.status !== 1) {
    throw new Error("Borrow failed");
  }
}

/**
 * Repay an asset to the LBP
 *
 * @param callerAddress - Caller address
 * @param repayTokenAddress - Address of the token to repay
 * @param repayAmount - Amount of token to repay
 */
export async function repayAsset(callerAddress: string, repayTokenAddress: string, repayAmount: number): Promise<void> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const { contract: repayTokenContract, tokenInfo: repayTokenInfo } = await getTokenContractForAddress(callerAddress, repayTokenAddress);

  const addressProviderDeployedResult = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressProviderContract = await hre.ethers.getContractAt("PoolAddressesProvider", addressProviderDeployedResult.address, signer);

  const poolAddress = await addressProviderContract.getPool();

  const poolContract = await hre.ethers.getContractAt("Pool", poolAddress, signer);

  const repayAmountOnChainInt = ethers.parseUnits(repayAmount.toString(), repayTokenInfo.decimals);

  const approveTxn = await repayTokenContract.approve(poolAddress, repayAmountOnChainInt);
  await approveTxn.wait();

  const txn = await poolContract.repay(repayTokenAddress, repayAmountOnChainInt, INTEREST_RATE_MODE_VARIABLE, callerAddress);
  const txnResponse = await txn.wait();

  if (txnResponse?.status !== 1) {
    throw new Error("Repay failed");
  }
}

/**
 * Liquidate an asset in the LBP
 *
 * @param collateralTokenAddress - Address of the collateral token
 * @param debtTokenAddress - Address of the debt token
 * @param borrowerAddress - Address of the borrower
 * @param debtAmountToCover - Amount of debt to cover
 * @param callerAddress - Address of the caller
 */
export async function liquidateAsset(
  collateralTokenAddress: string,
  debtTokenAddress: string,
  borrowerAddress: string,
  debtAmountToCover: number,
  callerAddress: string,
): Promise<void> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const { contract: borrowedTokenContract, tokenInfo: borrowedTokenInfo } = await getTokenContractForAddress(
    callerAddress,
    debtTokenAddress,
  );

  const addressProviderDeployedResult = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const addressProviderContract = await hre.ethers.getContractAt("PoolAddressesProvider", addressProviderDeployedResult.address, signer);

  const poolAddress = await addressProviderContract.getPool();

  const poolContract = await hre.ethers.getContractAt("Pool", poolAddress, signer);

  const debtAmountToCoverInt = ethers.parseUnits(debtAmountToCover.toString(), borrowedTokenInfo.decimals);

  const approveTxn = await borrowedTokenContract.approve(poolAddress, debtAmountToCoverInt);
  await approveTxn.wait();

  const txn = await poolContract.liquidationCall(collateralTokenAddress, debtTokenAddress, borrowerAddress, debtAmountToCoverInt, false);
  const txnResponse = await txn.wait();

  if (txnResponse?.status !== 1) {
    throw new Error("Liquidation failed");
  }
}

/**
 * Assert the Lending supply balance of the user
 *
 * @param userAddress - The address of the user
 * @param assetAddress - The address of the asset
 * @param expectedAmount - The expected amount of the asset
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertUserLendingSupplyBalance(
  userAddress: string,
  assetAddress: string,
  expectedAmount: string,
  tolerance: number = 1e-6,
): Promise<void> {
  await assertUserLendingSupplyBalanceBigInt(
    userAddress,
    assetAddress,
    await getTokenAmountFromAddress(assetAddress, expectedAmount),
    tolerance,
  );
}

/**
 * Assert the Lending supply balance of the user
 *
 * @param userAddress - The address of the user
 * @param assetAddress - The address of the asset
 * @param expectedTokenAmount - The expected amount of the asset
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertUserLendingSupplyBalanceBigInt(
  userAddress: string,
  assetAddress: string,
  expectedTokenAmount: bigint,
  tolerance: number = 1e-6,
): Promise<void> {
  const userSupplyBalance = await getUserSupplyBalance(assetAddress, userAddress);
  const toleranceBigInt = BigInt(Math.floor(Number(expectedTokenAmount) * tolerance));

  assert(
    userSupplyBalance.toBigInt() >= expectedTokenAmount - toleranceBigInt &&
      userSupplyBalance.toBigInt() <= expectedTokenAmount + toleranceBigInt,
    `User supply balance is not within tolerance. Expected: ${expectedTokenAmount}, Actual: ${userSupplyBalance.toBigInt()}`,
  );
}

/**
 * Assert the Lending debt balance of the user
 *
 * @param userAddress - The address of the user
 * @param assetAddress - The address of the asset
 * @param expectedAmount - The expected amount of the asset
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertUserLendingDebtBalance(
  userAddress: string,
  assetAddress: string,
  expectedAmount: string,
  tolerance: number = 1e-6,
): Promise<void> {
  await assertUserLendingDebtBalanceBigInt(
    userAddress,
    assetAddress,
    await getTokenAmountFromAddress(assetAddress, expectedAmount),
    tolerance,
  );
}

/**
 * Assert the Lending debt balance of the user
 *
 * @param userAddress - The address of the user
 * @param assetAddress - The address of the asset
 * @param expectedTokenAmount - The expected amount of the asset
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertUserLendingDebtBalanceBigInt(
  userAddress: string,
  assetAddress: string,
  expectedTokenAmount: bigint,
  tolerance: number = 1e-6,
): Promise<void> {
  const userDebtBalance = await getUserDebtBalance(assetAddress, userAddress);
  const toleranceBigInt = BigInt(Math.floor(Number(expectedTokenAmount) * tolerance));

  assert(
    userDebtBalance.toBigInt() >= expectedTokenAmount - toleranceBigInt &&
      userDebtBalance.toBigInt() <= expectedTokenAmount + toleranceBigInt,
    `User debt balance is not within tolerance. Expected: ${expectedTokenAmount}, Actual: ${userDebtBalance.toBigInt()}`,
  );
}

/**
 * Assert the user's lending supply and debt balance
 *
 * @param userAddress - The address of the user
 * @param supplyAssetAddress - The address of the supply asset
 * @param expectedSupplyAmount - The expected amount of the supply asset
 * @param debtAssetAddress - The address of the debt asset
 * @param expectedDebtAmount - The expected amount of the debt asset
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertUserLendingSupplyAndDebtBalance(
  userAddress: string,
  supplyAssetAddress: string,
  expectedSupplyAmount: number,
  debtAssetAddress: string,
  expectedDebtAmount: number,
  tolerance: number = 1e-6,
): Promise<void> {
  await assertUserLendingSupplyAndDebtBalanceBigInt(
    userAddress,
    supplyAssetAddress,
    await getTokenAmountFromAddress(supplyAssetAddress, expectedSupplyAmount),
    debtAssetAddress,
    await getTokenAmountFromAddress(debtAssetAddress, expectedDebtAmount),
    tolerance,
  );
}

/**
 * Assert the user's lending supply and debt balance
 *
 * @param userAddress - The address of the user
 * @param supplyAssetAddress - The address of the supply asset
 * @param expectedSupplyTokenAmount - The expected amount of the supply asset
 * @param debtAssetAddress - The address of the debt asset
 * @param expectedDebtTokenAmount - The expected amount of the debt asset
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertUserLendingSupplyAndDebtBalanceBigInt(
  userAddress: string,
  supplyAssetAddress: string,
  expectedSupplyTokenAmount: bigint,
  debtAssetAddress: string,
  expectedDebtTokenAmount: bigint,
  tolerance: number = 1e-6,
): Promise<void> {
  await assertUserLendingSupplyBalanceBigInt(userAddress, supplyAssetAddress, expectedSupplyTokenAmount, tolerance);
  await assertUserLendingDebtBalanceBigInt(userAddress, debtAssetAddress, expectedDebtTokenAmount, tolerance);
}
