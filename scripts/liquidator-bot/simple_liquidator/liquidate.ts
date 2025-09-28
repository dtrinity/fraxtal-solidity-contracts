import { BigNumber } from "@ethersproject/bignumber";
import { TransactionReceipt } from "ethers";
import hre from "hardhat";

import { getTokenBalanceFromAddress } from "../../../test/ecosystem/utils.token";
import { getUserHealthFactor } from "../../../utils/lending/account";
import { POOL_ADDRESSES_PROVIDER_ID } from "../../../utils/lending/deploy-ids";
import { getMaxLiquidationAmount } from "../../../utils/liquidator-bot/shared/utils";
import { getTokenContractForAddress } from "../../../utils/utils";

// Constants
const COLLATERAL_TOKEN_ADDRESS = "0xFC00000000000000000000000000000000000005";
const DEBT_TOKEN_ADDRESS = "0x788D96f655735f52c676A133f4dFC53cEC614d4A";
const BORROWER_ADDRESS = "0xE814D476a8a312818D9036F1713AAaE6313519f7"; // Kory's test wallet

/**
 * Execute a liquidation call on Aave lending pool
 *
 * @param collateralTokenAddress - The address of the collateral token
 * @param debtTokenAddress - The address of the debt token
 * @param borrowerAddress - The address of the borrower
 * @param callerAddress - The address of the caller
 * @returns Object containing the liquidation transaction receipt and seized collateral amount
 */
export async function executeLiquidation(
  collateralTokenAddress: string,
  debtTokenAddress: string,
  borrowerAddress: string,
  callerAddress: string,
): Promise<{
  receipt: TransactionReceipt;
  seizedCollateralAmount: BigNumber;
}> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const { tokenInfo: collateralTokenInfo } = await getTokenContractForAddress(callerAddress, collateralTokenAddress);

  // Get debt token contract and info
  const { contract: debtTokenContract, tokenInfo: debtTokenInfo } = await getTokenContractForAddress(callerAddress, debtTokenAddress);

  // Get pool contract
  const addressProvider = await hre.ethers.getContractAt(
    "PoolAddressesProvider",
    (await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID)).address,
    signer,
  );
  const poolAddress = await addressProvider.getPool();
  const pool = await hre.ethers.getContractAt("Pool", poolAddress, signer);

  const { toLiquidateAmount } = await getMaxLiquidationAmount(collateralTokenInfo, debtTokenInfo, borrowerAddress, callerAddress);

  const healthFactor = await getUserHealthFactor(borrowerAddress);

  console.log(`Collateral token: ${collateralTokenAddress} ${collateralTokenInfo.symbol}`);
  console.log(`Debt token: ${debtTokenAddress} ${debtTokenInfo.symbol}`);
  console.log(`Borrower: ${borrowerAddress}`);
  console.log(`Health factor: ${healthFactor}`);
  console.log("Debt-to-cover amount:", toLiquidateAmount.toString());

  const debtTokenBalance = await getTokenBalanceFromAddress(callerAddress, debtTokenAddress);
  console.log(`Caller debt token balance: ${debtTokenBalance}`);

  // Check if the caller has enough debt tokens to liquidate
  if (debtTokenBalance < toLiquidateAmount.toBigInt()) {
    throw new Error("Caller does not have enough debt tokens to liquidate");
  }

  // Approve pool to spend debt tokens
  console.log("Approving pool to spend debt tokens");
  const approveTx = await debtTokenContract.approve(poolAddress, toLiquidateAmount.toBigInt());
  await approveTx.wait();

  // Execute liquidation
  console.log("Executing liquidation");
  const liquidationTx = await pool.liquidationCall(
    collateralTokenAddress,
    debtTokenAddress,
    borrowerAddress,
    toLiquidateAmount.toBigInt(),
    false, // receive underlying asset instead of aToken
  );

  console.log("Waiting for liquidation transaction to be confirmed");
  const receipt = await liquidationTx.wait();

  if (!receipt) {
    throw new Error("Got null receipt for liquidation transaction");
  }

  if (receipt.status !== 1) {
    throw new Error("Liquidation transaction failed");
  }

  console.log("Liquidation transaction hash:", receipt.hash);

  // Find liquidation event to get seized collateral amount
  const liquidationEvent = receipt.logs
    .map((log) => {
      try {
        return pool.interface.parseLog(log as any);
      } catch {
        return null;
      }
    })
    .find((event) => event?.name === "LiquidationCall");

  return {
    receipt,
    seizedCollateralAmount: liquidationEvent ? liquidationEvent.args.liquidatedCollateralAmount : null,
  };
}

// Main function
/**
 * Main function to execute liquidation
 *
 * Usage:
 *   yarn hardhat run --network <network> scripts/liquidator-bot/simple_liquidator/liquidate.ts
 *
 * @returns void
 */
async function main(): Promise<void> {
  const { liquidatorBotDeployer } = await hre.getNamedAccounts();

  if (!liquidatorBotDeployer) {
    throw new Error("Liquidator bot deployer not found, please set the PK_<NETWORK>_LIQUIDATOR_BOT environment variable");
  }

  const { seizedCollateralAmount } = await executeLiquidation(
    COLLATERAL_TOKEN_ADDRESS,
    DEBT_TOKEN_ADDRESS,
    BORROWER_ADDRESS,
    liquidatorBotDeployer,
  );
  console.log("Seized collateral amount:", seizedCollateralAmount);
}

main()
  .catch(console.error)
  .finally(() => {
    process.exit(0);
  });
