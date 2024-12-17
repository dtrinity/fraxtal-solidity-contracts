import { BigNumber } from "@ethersproject/bignumber";
import chai, { assert } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { DLoopVaultBase } from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { getEventFromTransaction } from "../../utils/event";
import { fetchTokenInfo, fetchTokenInfoFromAddress } from "../../utils/token";
import {
  getDLoopVaultCurveDeploymentName,
  getDLoopVaultUniswapV3DeploymentName,
} from "../../utils/vault/dloop.utils";
import {
  approveTokenByAddress,
  getTokenAmountFromAddress,
  getTokenContractForSymbol,
} from "./utils.token";

/**
 * Get the DLoopVaultUniswapV3 contract object
 *
 * @param hre - Hardhat Runtime Environment
 * @param underlyingTokenSymbol - The symbol of the underlying token
 * @param targetLeverageBps - The target leverage in bps
 * @param callerAddress - The address of the caller
 * @returns - The DLoopVaultUniswapV3 contract object
 */
export async function getDLoopVaultUniswapV3Contract(
  hre: HardhatRuntimeEnvironment,
  underlyingTokenSymbol: string,
  targetLeverageBps: number,
  callerAddress: string,
): Promise<DLoopVaultBase> {
  const { tokenInfo } = await getTokenContractForSymbol(
    callerAddress,
    underlyingTokenSymbol,
  );
  return getDLoopVaultUniswapV3ContractFromAddress(
    hre,
    tokenInfo.address,
    targetLeverageBps,
    callerAddress,
  );
}

/**
 * Get the DLoopVaultUniswapV3 contract object from the address
 *
 * @param hre - Hardhat Runtime Environment
 * @param underlyingTokenAddress - The address of the underlying token
 * @param targetLeverageBps - The target leverage in bps
 * @param callerAddress - The address of the caller
 * @returns - The DLoopVaultUniswapV3 contract object
 */
export async function getDLoopVaultUniswapV3ContractFromAddress(
  hre: HardhatRuntimeEnvironment,
  underlyingTokenAddress: string,
  targetLeverageBps: number,
  callerAddress: string,
): Promise<DLoopVaultBase> {
  const { symbol: underlyingTokenSymbol } = await fetchTokenInfoFromAddress(
    underlyingTokenAddress,
  );
  const deploymentName = getDLoopVaultUniswapV3DeploymentName(
    underlyingTokenSymbol,
    targetLeverageBps,
  );
  const { address: deployedAddress } =
    await hre.deployments.get(deploymentName);
  return hre.ethers.getContractAt(
    "DLoopVaultBase",
    deployedAddress,
    await hre.ethers.getSigner(callerAddress),
  );
}

/**
 * Get the DLoopVaultCurve contract object
 *
 * @param hre - Hardhat Runtime Environment
 * @param underlyingTokenSymbol - The symbol of the underlying token
 * @param targetLeverageBps - The target leverage in bps
 * @param callerAddress - The address of the caller
 * @returns - The DLoopVaultCurve contract object
 */
export async function getDLoopVaultCurveContract(
  hre: HardhatRuntimeEnvironment,
  underlyingTokenSymbol: string,
  targetLeverageBps: number,
  callerAddress: string,
): Promise<DLoopVaultBase> {
  const tokenInfo = await fetchTokenInfo(hre, underlyingTokenSymbol);
  return getDLoopVaultCurveContractFromAddress(
    hre,
    tokenInfo.address,
    targetLeverageBps,
    callerAddress,
  );
}

/**
 * Get the DLoopVaultCurve contract object from the address
 *
 * @param hre - Hardhat Runtime Environment
 * @param underlyingTokenAddress - The address of the underlying token
 * @param targetLeverageBps - The target leverage in bps
 * @param callerAddress - The address of the caller
 * @returns - The DLoopVaultCurve contract object
 */
export async function getDLoopVaultCurveContractFromAddress(
  hre: HardhatRuntimeEnvironment,
  underlyingTokenAddress: string,
  targetLeverageBps: number,
  callerAddress: string,
): Promise<DLoopVaultBase> {
  const { symbol: underlyingTokenSymbol } = await fetchTokenInfoFromAddress(
    underlyingTokenAddress,
  );
  const deploymentName = getDLoopVaultCurveDeploymentName(
    underlyingTokenSymbol,
    targetLeverageBps,
  );
  const { address: deployedAddress } =
    await hre.deployments.get(deploymentName);
  return hre.ethers.getContractAt(
    "DLoopVaultBase",
    deployedAddress,
    await hre.ethers.getSigner(callerAddress),
  );
}

/**
 * Get the shares balance of the owner in the vault
 * - The value is returned as a bigint and the corresponding decimals
 *
 * @param hre - Hardhat Runtime Environment
 * @param vaultAddress - The address of the vault
 * @param ownerAddress - The address of the owner
 * @returns The shares balance of the owner
 */
export async function getDLoopSharesBalance(
  hre: HardhatRuntimeEnvironment,
  vaultAddress: string,
  ownerAddress: string,
): Promise<{
  value: bigint;
  decimals: number;
}> {
  const vaultContract = await hre.ethers.getContractAt(
    "DLoopVaultBase",
    vaultAddress,
    await hre.ethers.getSigner(ownerAddress),
  );
  const rawValue = await vaultContract.balanceOf(ownerAddress);
  const decimals = await vaultContract.decimals();
  return {
    value: rawValue,
    decimals: BigNumber.from(decimals).toNumber(),
  };
}

/**
 * Assert the shares balance of the owner
 *
 * @param ownerAddress - The address of the owner
 * @param vaultAddress - The address of the vault
 * @param expectedShares - The expected amount of shares
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertSharesBalance(
  ownerAddress: string,
  vaultAddress: string,
  expectedShares: number,
  tolerance: number = 1e-6,
): Promise<void> {
  const balance = await getDLoopSharesBalance(hre, vaultAddress, ownerAddress);

  assert.equal(balance.decimals, 18);
  const actualShares = Number(
    ethers.formatUnits(balance.value, balance.decimals),
  );
  assert.approximately(
    actualShares,
    expectedShares,
    tolerance * expectedShares,
  );
}

/**
 * Assert the current leverage of the DLoopVault
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param expectedLeverageBps - The expected leverage in bps (i.e. 30000 means 300% leverage or 3x)
 */
export async function assertCurrentLeverageBps(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  expectedLeverageBps: bigint,
): Promise<void> {
  const currentLeverageBps =
    await dLOOPsFRAX300Contract.getCurrentLeverageBps();
  assert.equal(currentLeverageBps, expectedLeverageBps);
}

/**
 * Assert that the DLoopVault is too imbalanced
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param reverted - Whether the transaction should be reverted
 */
export async function assertCheckIsTooImbalanced(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  reverted: boolean,
): Promise<void> {
  if (!reverted) {
    await dLOOPsFRAX300Contract.checkIsTooImbalanced();
  } else {
    await chai
      .expect(dLOOPsFRAX300Contract.checkIsTooImbalanced())
      .to.be.revertedWithCustomError(dLOOPsFRAX300Contract, "TooImbalanced");
  }
}

/**
 * Assert the total assets of the DLoopVault
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param expectedTotalAssets - The expected total assets
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertTotalAssets(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  expectedTotalAssets: number,
  tolerance: number = 1e-6,
): Promise<void> {
  const underlyingTokenAddress =
    await dLOOPsFRAX300Contract.getUnderlyingAssetAddress();
  const tokenInfo = await fetchTokenInfo(hre, underlyingTokenAddress);
  const totalAssets = await dLOOPsFRAX300Contract.totalAssets();
  const actualTotalAssets = Number(
    ethers.formatUnits(totalAssets, tokenInfo.decimals),
  );
  assert.approximately(
    actualTotalAssets,
    expectedTotalAssets,
    tolerance * expectedTotalAssets,
  );
}

/**
 * Assert the total supply of the DLoopVault
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param expectedTotalSupply - The expected total supply
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertTotalSupply(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  expectedTotalSupply: number,
  tolerance: number = 1e-6,
): Promise<void> {
  const decimals = await dLOOPsFRAX300Contract.decimals();
  const totalSupply = await dLOOPsFRAX300Contract.totalSupply();
  const actualTotalSupply = Number(ethers.formatUnits(totalSupply, decimals));
  assert.approximately(
    actualTotalSupply,
    expectedTotalSupply,
    tolerance * expectedTotalSupply,
  );
}

/**
 * Assert the total assets and total supply of the DLoopVault
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param expectedTotalAssets - The expected total assets
 * @param expectedTotalSupply - The expected total supply
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertTotalAssetAndSupply(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  expectedTotalAssets: number,
  expectedTotalSupply: number,
  tolerance: number = 1e-6,
): Promise<void> {
  await assertTotalAssets(
    dLOOPsFRAX300Contract,
    expectedTotalAssets,
    tolerance,
  );
  await assertTotalSupply(
    dLOOPsFRAX300Contract,
    expectedTotalSupply,
    tolerance,
  );
}

/**
 * Assert the total assets and total supply of the DLoopVault using bigint values
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param expectedTotalAssets - Expected total assets
 * @param expectedTotalSupply - Expected total supply
 * @param tolerance - The tolerance for float imprecision (default: 1e-6)
 */
export async function assertTotalAssetAndSupplyBigInt(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  expectedTotalAssets: bigint,
  expectedTotalSupply: bigint,
  tolerance: number = 1e-6,
): Promise<void> {
  const totalAssets = await dLOOPsFRAX300Contract.totalAssets();
  const totalSupply = await dLOOPsFRAX300Contract.totalSupply();

  const toleranceBigInt = BigInt(
    Math.floor(Number(expectedTotalAssets) * tolerance),
  );

  assert(
    totalAssets >= expectedTotalAssets - toleranceBigInt &&
      totalAssets <= expectedTotalAssets + toleranceBigInt,
    `Total assets ${totalAssets} is not within tolerance of expected ${expectedTotalAssets}`,
  );

  assert(
    totalSupply >= expectedTotalSupply - toleranceBigInt &&
      totalSupply <= expectedTotalSupply + toleranceBigInt,
    `Total supply ${totalSupply} is not within tolerance of expected ${expectedTotalSupply}`,
  );
}

/**
 * Deposit the given amount of assets to the DLoopVault and assert the Deposit event
 * - It also approves the DLoopVault to spend the underlying token
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param underlyingTokenSymbol - The symbol of the underlying token
 * @param callerAddress - The address of the caller
 * @param assetAmount - The amount of assets to deposit
 */
export async function depositWithApprovalToDLoop(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  underlyingTokenSymbol: string,
  callerAddress: string,
  assetAmount: number,
): Promise<void> {
  const { tokenInfo } = await getTokenContractForSymbol(
    callerAddress,
    underlyingTokenSymbol,
  );

  await depositWithApprovalToDLoopFromTokenAddress(
    dLOOPsFRAX300Contract,
    tokenInfo.address,
    callerAddress,
    assetAmount,
  );
}

/**
 * Deposit the given amount of assets to the DLoopVault and assert the Deposit event
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param underlyingTokenAddress - The address of the underlying token
 * @param callerAddress - The address of the caller
 * @param assetAmount - The amount of assets to deposit
 */
export async function depositWithApprovalToDLoopFromTokenAddress(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  underlyingTokenAddress: string,
  callerAddress: string,
  assetAmount: number,
): Promise<void> {
  // Approve the vault to spend the underlying token on behalf of testAccount1
  await approveTokenByAddress(
    callerAddress,
    await dLOOPsFRAX300Contract.getAddress(),
    underlyingTokenAddress,
    100,
  );

  // Perform the deposit
  const tx = await dLOOPsFRAX300Contract.deposit(
    await getTokenAmountFromAddress(
      assetAmount.toString(),
      underlyingTokenAddress,
    ),
    callerAddress,
  );

  // Wait for the transaction to be mined
  const receipt = await tx.wait();

  if (receipt === undefined || receipt === null) {
    throw new Error("The transaction receipt is empty");
  }

  // Make sure the Deposit event is emitted
  const logs = await getEventFromTransaction(dLOOPsFRAX300Contract, receipt, [
    "Deposit",
  ]);
  assert.isNotEmpty(logs);
}

/**
 * Redeem the given amount of shares from the DLoopVault and assert the Redeem event
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param callerAddress - The address of the caller
 * @param sharesAmount - The amount of shares to redeem
 */
export async function redeemWithApprovalFromDLoop(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  callerAddress: string,
  sharesAmount: number,
): Promise<void> {
  // Approve the vault to spend the shares on behalf of testAccount1
  await approveTokenByAddress(
    callerAddress,
    await dLOOPsFRAX300Contract.getAddress(),
    await dLOOPsFRAX300Contract.getAddress(), // The vault contract is also the shares token contract
    sharesAmount,
  );

  // Perform the redeem
  const tx = await dLOOPsFRAX300Contract.redeem(
    ethers.parseUnits(
      sharesAmount.toString(),
      await dLOOPsFRAX300Contract.decimals(),
    ),
    callerAddress,
    callerAddress,
  );

  // Wait for the transaction to be mined
  const receipt = await tx.wait();

  if (receipt === undefined || receipt === null) {
    throw new Error("The transaction receipt is empty");
  }

  // Make sure the Withdraw event is emitted
  const logs = await getEventFromTransaction(dLOOPsFRAX300Contract, receipt, [
    "Withdraw",
  ]);
  assert.isNotEmpty(logs);
}

/**
 * Increase the leverage of the DLoopVault and assert the IncreaseLeverage event
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param callerAddress - The address of the caller
 * @param dUSDSymbol - The symbol of the dUSD token
 * @param dUSDAmount - The amount of dUSD to mint
 * @param maxUnderlyingTokenPrice - The maximum price of the underlying token
 */
export async function decreaseLeverageWithApproval(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  callerAddress: string,
  dUSDSymbol: string,
  dUSDAmount: number,
  maxUnderlyingTokenPrice: number,
): Promise<void> {
  const { tokenInfo: dusdTokenInfo } = await getTokenContractForSymbol(
    callerAddress,
    dUSDSymbol,
  );

  await decreaseLeverageWithApprovalFromTokenAddress(
    dLOOPsFRAX300Contract,
    callerAddress,
    dusdTokenInfo.address,
    dUSDAmount,
    maxUnderlyingTokenPrice,
  );
}

/**
 * Decrease the leverage of the DLoopVault and assert the DecreaseLeverage event
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param callerAddress - The address of the caller
 * @param dUSDTokenAddress - The address of the dUSD token
 * @param dUSDAmount - The amount of dUSD to mint
 * @param maxUnderlyingTokenPrice - The maximum price of the underlying token
 */
export async function decreaseLeverageWithApprovalFromTokenAddress(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  callerAddress: string,
  dUSDTokenAddress: string,
  dUSDAmount: number,
  maxUnderlyingTokenPrice: number,
): Promise<void> {
  // Approve the vault to spend the dUSD on behalf of testAccount1
  await approveTokenByAddress(
    callerAddress,
    await dLOOPsFRAX300Contract.getAddress(),
    dUSDTokenAddress,
    dUSDAmount,
  );

  const oracleContract = await hre.ethers.getContractAt(
    "contracts/lending/core/interfaces/IPriceOracleGetter.sol:IPriceOracleGetter",
    await dLOOPsFRAX300Contract.getOracleAddress(),
  );

  const baseCurrencyUnit: bigint = await oracleContract.BASE_CURRENCY_UNIT();

  // Make sure the oracle price decimals is as expected
  assert.equal(
    baseCurrencyUnit,
    ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
  );

  // Rebalance the vault to the target leverage
  await dLOOPsFRAX300Contract.decreaseLeverage(
    await getTokenAmountFromAddress(dUSDAmount.toString(), dUSDTokenAddress),
    ethers.parseUnits(
      maxUnderlyingTokenPrice.toString(),
      AAVE_ORACLE_USD_DECIMALS,
    ), // underlying token max price
  );
}

/**
 * Increase the leverage of the DLoopVault and assert the IncreaseLeverage event
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param callerAddress - The address of the caller
 * @param underlyingTokenSymbol - The symbol of the underlying token
 * @param underlyingTokenAmount - The amount of the underlying token
 * @param minUnderlyingTokenPrice - The minimum price of the underlying token
 */
export async function increaseLeverageWithApproval(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  callerAddress: string,
  underlyingTokenSymbol: string,
  underlyingTokenAmount: number,
  minUnderlyingTokenPrice: number,
): Promise<void> {
  const { tokenInfo } = await getTokenContractForSymbol(
    callerAddress,
    underlyingTokenSymbol,
  );

  await increaseLeverageWithApprovalFromTokenAddress(
    dLOOPsFRAX300Contract,
    callerAddress,
    tokenInfo.address,
    underlyingTokenAmount,
    minUnderlyingTokenPrice,
  );
}

/**
 * Increase the leverage of the DLoopVault and assert the IncreaseLeverage event
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param callerAddress - The address of the caller
 * @param underlyingTokenAddress - The address of the underlying token
 * @param underlyingTokenAmount - The amount of the underlying token
 * @param minUnderlyingTokenPrice - The minimum price of the underlying token
 */
export async function increaseLeverageWithApprovalFromTokenAddress(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  callerAddress: string,
  underlyingTokenAddress: string,
  underlyingTokenAmount: number,
  minUnderlyingTokenPrice: number,
): Promise<void> {
  // Approve the vault to spend the dUSD on behalf of testAccount1
  await approveTokenByAddress(
    callerAddress,
    await dLOOPsFRAX300Contract.getAddress(),
    underlyingTokenAddress,
    underlyingTokenAmount,
  );

  const oracleContract = await hre.ethers.getContractAt(
    "contracts/lending/core/interfaces/IPriceOracleGetter.sol:IPriceOracleGetter",
    await dLOOPsFRAX300Contract.getOracleAddress(),
  );

  const baseCurrencyUnit: bigint = await oracleContract.BASE_CURRENCY_UNIT();

  // Make sure the oracle price decimals is as expected
  assert.equal(
    baseCurrencyUnit,
    ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
  );

  // Rebalance the vault to the target leverage
  await dLOOPsFRAX300Contract.increaseLeverage(
    await getTokenAmountFromAddress(
      underlyingTokenAmount.toString(),
      underlyingTokenAddress,
    ),
    ethers.parseUnits(
      minUnderlyingTokenPrice.toString(),
      AAVE_ORACLE_USD_DECIMALS,
    ), // underlying token min price
  );
}

/**
 * Mint shares in the DLoopVault and assert the Deposit event
 * - It also approves the DLoopVault to spend the underlying token
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param underlyingTokenSymbol - The symbol of the underlying token
 * @param callerAddress - The address of the caller
 * @param sharesAmount - The amount of shares to mint
 */
export async function mintWithApprovalToDLoop(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  underlyingTokenSymbol: string,
  callerAddress: string,
  sharesAmount: number,
): Promise<void> {
  const { tokenInfo } = await getTokenContractForSymbol(
    callerAddress,
    underlyingTokenSymbol,
  );

  await mintWithApprovalToDLoopFromTokenAddress(
    dLOOPsFRAX300Contract,
    tokenInfo.address,
    callerAddress,
    sharesAmount,
  );
}

/**
 * Mint shares in the DLoopVault and assert the Deposit event
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param underlyingTokenAddress - The address of the underlying token
 * @param callerAddress - The address of the caller
 * @param sharesAmount - The amount of shares to mint
 */
export async function mintWithApprovalToDLoopFromTokenAddress(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  underlyingTokenAddress: string,
  callerAddress: string,
  sharesAmount: number,
): Promise<void> {
  // Calculate the amount of assets needed to mint the requested shares
  const assets = await dLOOPsFRAX300Contract.convertToAssets(
    ethers.parseUnits(
      sharesAmount.toString(),
      await dLOOPsFRAX300Contract.decimals(),
    ),
  );

  // Approve the vault to spend the underlying token on behalf of callerAddress
  await approveTokenByAddress(
    callerAddress,
    await dLOOPsFRAX300Contract.getAddress(),
    underlyingTokenAddress,
    Number(ethers.formatUnits(assets, await dLOOPsFRAX300Contract.decimals())),
  );

  // Perform the mint
  const tx = await dLOOPsFRAX300Contract.mint(
    ethers.parseUnits(
      sharesAmount.toString(),
      await dLOOPsFRAX300Contract.decimals(),
    ),
    callerAddress,
  );

  // Wait for the transaction to be mined
  const receipt = await tx.wait();

  if (receipt === undefined || receipt === null) {
    throw new Error("The transaction receipt is empty");
  }

  // Make sure the Deposit event is emitted
  const logs = await getEventFromTransaction(dLOOPsFRAX300Contract, receipt, [
    "Deposit",
  ]);
  assert.isNotEmpty(logs);
}

/**
 * Withdraw assets from the DLoopVault and assert the Withdraw event
 *
 * @param dLOOPsFRAX300Contract - The DLoopVault contract
 * @param callerAddress - The address of the caller
 * @param assetAmount - The amount of assets to withdraw
 */
export async function withdrawWithApprovalFromDLoop(
  dLOOPsFRAX300Contract: DLoopVaultBase,
  callerAddress: string,
  assetAmount: number,
): Promise<void> {
  const underlyingTokenAddress =
    await dLOOPsFRAX300Contract.getUnderlyingAssetAddress();
  const tokenInfo = await fetchTokenInfo(hre, underlyingTokenAddress);

  // Convert assetAmount to the correct decimal representation
  const assetAmountBigInt = ethers.parseUnits(
    assetAmount.toString(),
    tokenInfo.decimals,
  );

  // Calculate the number of shares to burn based on the assets to withdraw
  const shares = await dLOOPsFRAX300Contract.convertToShares(assetAmountBigInt);

  // Approve the vault to spend the shares on behalf of callerAddress
  await approveTokenByAddress(
    callerAddress,
    await dLOOPsFRAX300Contract.getAddress(),
    await dLOOPsFRAX300Contract.getAddress(), // The vault contract is also the shares token contract
    Number(ethers.formatUnits(shares, await dLOOPsFRAX300Contract.decimals())),
  );

  // Perform the withdraw
  const tx = await dLOOPsFRAX300Contract.withdraw(
    assetAmountBigInt,
    callerAddress,
    callerAddress,
  );

  // Wait for the transaction to be mined
  const receipt = await tx.wait();

  if (receipt === undefined || receipt === null) {
    throw new Error("The transaction receipt is empty");
  }

  // Make sure the Withdraw event is emitted
  const logs = await getEventFromTransaction(dLOOPsFRAX300Contract, receipt, [
    "Withdraw",
  ]);
  assert.isNotEmpty(logs);
}
