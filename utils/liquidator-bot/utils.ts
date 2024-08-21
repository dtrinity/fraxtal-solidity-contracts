import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import hre from "hardhat";

import { getConfig } from "../../config/config";
import {
  FlashLoanLiquidatorBorrowRepayAave,
  FlashMintLiquidatorBorrowRepayAave,
} from "../../typechain-types";
import { UNISWAP_STATIC_ORACLE_WRAPPER_ID } from "../dex/deploy-ids";
import { getStaticOraclePrice } from "../dex/oracle";
import { getDEXPoolAddressForPair } from "../dex/pool";
import { convertToSwapPath } from "../dex/utils";
import { getUserDebtBalance, getUserSupplyBalance } from "../lending/balance";
import { getReserveConfigurationData } from "../lending/reserve";
import { getReserveTokensAddressesFromAddress } from "../lending/token";
import PercentMath, { pow10 } from "../maths/PercentMath";
import { fetchTokenInfo, TokenInfo } from "../token";
import {
  FLASH_LOAN_LIQUIDATOR_BORROW_REPAY_AAVE_ID,
  FLASH_MINT_LIQUIDATOR_BORROW_REPAY_AAVE_ID,
} from "./deploy-ids";
import { NotProfitableLiquidationError } from "./errors";

/**
 * Get the flash mint liquidator bot contract
 *
 * @param callerAddress - Address of the caller
 * @returns The flash mint liquidator bot contract
 */
export async function getFlashMintLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashMintLiquidatorBorrowRepayAave }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_MINT_LIQUIDATOR_BORROW_REPAY_AAVE_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_MINT_LIQUIDATOR_BORROW_REPAY_AAVE_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashMintLiquidatorBorrowRepayAave",
    liquidatorBotDeployment.address,
    signer,
  );

  return {
    contract: contract,
  };
}

/**
 * Get the flash loan liquidator bot contract
 *
 * @param callerAddress - Address of the caller
 * @returns - The flash loan liquidator bot contract
 */
export async function getFlashLoanLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashLoanLiquidatorBorrowRepayAave }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_LOAN_LIQUIDATOR_BORROW_REPAY_AAVE_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_LOAN_LIQUIDATOR_BORROW_REPAY_AAVE_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashLoanLiquidatorBorrowRepayAave",
    liquidatorBotDeployment.address,
    signer,
  );

  return {
    contract: contract,
  };
}

/**
 * Perform the liquidation of the borrower account
 *
 * @param borrowerAccountAddress - The account to be liquidated
 * @param liquidatorAccountAddress - The account to be the liquidator
 * @param borrowTokenAddress - The address of the token to be borrowed
 * @param collateralTokenAddress - The address of the token to be used as collateral
 * @param repayAmount - The amount to be repaid in the smallest unit of the borrow token
 * @param liquidatorBotFlashMintContract - The liquidator bot contract with flash minting dUSD
 * @param liquidatorBotFlashLoanContract - The liquidator bot contract with flash loan
 */
export async function performLiquidation(
  borrowerAccountAddress: string,
  liquidatorAccountAddress: string,
  borrowTokenAddress: string,
  collateralTokenAddress: string,
  repayAmount: bigint,
  liquidatorBotFlashMintContract: FlashMintLiquidatorBorrowRepayAave,
  liquidatorBotFlashLoanContract: FlashLoanLiquidatorBorrowRepayAave,
): Promise<void> {
  const collateralTokenInfo = await fetchTokenInfo(hre, collateralTokenAddress);
  const borrowTokenInfo = await fetchTokenInfo(hre, borrowTokenAddress);

  const collateralReverseAddresses = await getReserveTokensAddressesFromAddress(
    collateralTokenInfo.address,
  );
  const borrowReverseAddresses = await getReserveTokensAddressesFromAddress(
    borrowTokenInfo.address,
  );

  // Get the swap path to swap from collateralToken to borrowToken
  // after the liquidation (if the borrowToken != collateralToken)
  // so that we can burn the flash-minted borrowToken
  const path = await getSwapPath(collateralTokenInfo, borrowTokenInfo);

  const config = await getConfig(hre);

  if (
    config.liquidatorBot.dUSDAddress === "" ||
    config.liquidatorBot.dUSDAddress === undefined
  ) {
    throw new Error("dUSD address is not set in the liquidator config");
  }

  if (borrowTokenInfo.address === config.liquidatorBot.dUSDAddress) {
    // Add the liquidatorAccountAddress as a liquidator
    const isLiquidator = await liquidatorBotFlashMintContract.isLiquidator(
      liquidatorAccountAddress,
    );

    if (!isLiquidator) {
      await liquidatorBotFlashMintContract.addLiquidator(
        liquidatorAccountAddress,
      );
    }

    console.log("Liquidating with flash minting");

    // Now, we can liquidate the debt of testAccount1
    const txn = await liquidatorBotFlashMintContract
      .connect(await hre.ethers.getSigner(liquidatorAccountAddress))
      .liquidate(
        borrowReverseAddresses.aTokenAddress,
        collateralReverseAddresses.aTokenAddress,
        borrowerAccountAddress,
        repayAmount,
        false, // the received collateral will be sent to the liquidatorAccountAddress
        path,
      );
    const receipt = await txn.wait();
    console.log("Liquidation gas used:", receipt?.gasUsed);
    console.log("Liquidation transaction hash:", receipt?.hash);
  } else {
    // Add the liquidatorAccountAddress as a liquidator
    const isLiquidator = await liquidatorBotFlashLoanContract.isLiquidator(
      liquidatorAccountAddress,
    );

    if (!isLiquidator) {
      await liquidatorBotFlashLoanContract.addLiquidator(
        liquidatorAccountAddress,
      );
    }

    console.log("Liquidating with flash loan");

    // Now, we can liquidate the debt of testAccount1
    const txn = await liquidatorBotFlashLoanContract
      .connect(await hre.ethers.getSigner(liquidatorAccountAddress))
      .liquidate(
        borrowReverseAddresses.aTokenAddress,
        collateralReverseAddresses.aTokenAddress,
        borrowerAccountAddress,
        repayAmount,
        false, // the received collateral will be sent to the liquidatorAccountAddress
        path,
      );
    const receipt = await txn.wait();
    console.log("Liquidation gas used:", receipt?.gasUsed);
    console.log("Liquidation transaction hash:", receipt?.hash);
  }
}

/**
 * Get the swap path for swapping from the input token to the output token
 * - We assume that for each token, there is a DEX pool for swapping to dUSD
 *
 * @param inputTokenInfo - The token info of the input token
 * @param outputTokenInfo - The token info of the output token
 * @returns The swap path
 */
async function getSwapPath(
  inputTokenInfo: TokenInfo,
  outputTokenInfo: TokenInfo,
): Promise<string> {
  // We assume that for each token, there is a DEX pool for swapping to dUSD
  // The quote token of the oracle is a stablecoin (in our case, dUSD)
  const { address: oracleContractAddress } = await hre.deployments.get(
    UNISWAP_STATIC_ORACLE_WRAPPER_ID,
  );
  const oracleContract = await hre.ethers.getContractAt(
    "StaticOracleWrapper",
    oracleContractAddress,
  );
  const quoteTokenAddress = await oracleContract.QUOTE_TOKEN();

  if (quoteTokenAddress === outputTokenInfo.address) {
    // This case mean the borrowToken is the stablecoin, thus we don't need an intermediate token

    // Make sure the DEX pool for swapping from collateralToken to borrowToken exists
    const { poolAddress, fee: swapPoolFeeSchema } =
      await getDEXPoolAddressForPair(
        outputTokenInfo.address,
        inputTokenInfo.address,
      );

    if (poolAddress === hre.ethers.ZeroAddress) {
      throw new Error(
        `Swap pool for ${outputTokenInfo.symbol}-${inputTokenInfo.symbol} does not exist`,
      );
    }
    return convertToSwapPath(
      [outputTokenInfo.address, inputTokenInfo.address],
      [swapPoolFeeSchema],
      false,
    );
  } else if (quoteTokenAddress === inputTokenInfo.address) {
    // This case mean the collateralToken is the stablecoin, thus we don't need an intermediate token

    // Make sure the DEX pool for swapping from borrowToken to dUSD exists
    const { poolAddress, fee: swapPoolFeeSchema } =
      await getDEXPoolAddressForPair(
        outputTokenInfo.address,
        quoteTokenAddress,
      );

    if (poolAddress === hre.ethers.ZeroAddress) {
      throw new Error(
        `Swap pool for ${outputTokenInfo.symbol}-${quoteTokenAddress} does not exist`,
      );
    }

    return convertToSwapPath(
      [outputTokenInfo.address, quoteTokenAddress],
      [swapPoolFeeSchema],
      false,
    );
  } else {
    // If there is a direct pool from inputToken to outputToken, we use it
    const { poolAddress: poolAddress, fee: swapPoolFeeSchema } =
      await getDEXPoolAddressForPair(
        outputTokenInfo.address,
        inputTokenInfo.address,
      );

    if (poolAddress !== hre.ethers.ZeroAddress) {
      return convertToSwapPath(
        [outputTokenInfo.address, inputTokenInfo.address],
        [swapPoolFeeSchema],
        false,
      );
    }

    // This case we need an intermediate token, which is the oracle quoteToken (a stablecoin)

    // Make sure the DEX pool for swapping from collateralToken to dUSD exists
    const { poolAddress: poolAddress1, fee: swapPoolFeeSchema1 } =
      await getDEXPoolAddressForPair(
        outputTokenInfo.address,
        quoteTokenAddress,
      );

    if (poolAddress1 === hre.ethers.ZeroAddress) {
      throw new Error(
        `Swap pool for ${outputTokenInfo.symbol}-${quoteTokenAddress} does not exist`,
      );
    }

    // Make sure the DEX pool for swapping from dUSD to outputToken exists
    const { poolAddress: poolAddress2, fee: swapPoolFeeSchema2 } =
      await getDEXPoolAddressForPair(quoteTokenAddress, inputTokenInfo.address);

    if (poolAddress2 === hre.ethers.ZeroAddress) {
      throw new Error(
        `Swap pool for ${quoteTokenAddress}-${inputTokenInfo.symbol} does not exist`,
      );
    }

    return convertToSwapPath(
      [outputTokenInfo.address, quoteTokenAddress, inputTokenInfo.address],
      [swapPoolFeeSchema1, swapPoolFeeSchema2],
      false,
    );
  }
}

/**
 * Get the liquidation profit in USD
 *
 * @param borrowTokenInfo - The token info of the borrowed token
 * @param borrowTokenPriceInUSD - The price of the borrowed token in USD
 * @param borrowTokenPriceInUSD.rawValue - The price of the borrowed token in USD (ie. 1e6 for 1 USD)
 * @param borrowTokenPriceInUSD.decimals - The decimals of the borrowed token price
 * @param liquidateRawAmount - The amount to be liquidated
 * @returns - The liquidation profit in USD
 */
export async function getLiquidationProfitInUSD(
  borrowTokenInfo: TokenInfo,
  borrowTokenPriceInUSD: {
    rawValue: BigNumber; // before scaling with the decimals
    decimals: number;
  },
  liquidateRawAmount: bigint,
): Promise<number> {
  const { liquidationBonus } = await getReserveConfigurationData(
    borrowTokenInfo.address,
  );

  const liquidateAmountInUSD =
    borrowTokenPriceInUSD.rawValue.mul(liquidateRawAmount);

  let res = PercentMath.percentMul(
    liquidateAmountInUSD,
    BigNumber.from(liquidationBonus).sub(PercentMath.BASE_PERCENT),
  );
  res = res.div(pow10(borrowTokenInfo.decimals));

  return res.toNumber() / 10 ** borrowTokenPriceInUSD.decimals;
}

/**
 * Get the maximum liquidation amount of the borrower
 *
 * @param collateralTokenInfo - The token info of the collateral token
 * @param borrowTokenInfo - The token info of the borrowed token
 * @param borrowerAddress - The address of the borrower
 * @param callerAddress - The address of the caller
 * @returns - The maximum liquidation amount of the borrower
 */
export async function getMaxLiquidationAmount(
  collateralTokenInfo: TokenInfo,
  borrowTokenInfo: TokenInfo,
  borrowerAddress: string,
  callerAddress: string,
): Promise<{
  toLiquidateAmount: BigNumber;
}> {
  // Prepare the data
  const [
    collateralTokenPriceInUSD,
    borrowTokenPriceInUSD,
    totalUserCollateral,
    totalUserDebt,
    { liquidationBonus },
  ] = await Promise.all([
    getStaticOraclePrice(callerAddress, collateralTokenInfo.address),
    getStaticOraclePrice(callerAddress, borrowTokenInfo.address),
    getUserSupplyBalance(collateralTokenInfo.address, borrowerAddress),
    getUserDebtBalance(borrowTokenInfo.address, borrowerAddress),
    getReserveConfigurationData(collateralTokenInfo.address),
  ]);

  const liquidationBonusBN = BigNumber.from(liquidationBonus);

  const { toLiquidateAmount } = getMaxLiquidationAmountCalculation(
    collateralTokenInfo,
    totalUserCollateral,
    collateralTokenPriceInUSD,
    borrowTokenInfo,
    totalUserDebt,
    borrowTokenPriceInUSD,
    liquidationBonusBN,
  );

  return {
    toLiquidateAmount: toLiquidateAmount,
  };
}

/**
 * Calculate the maximum liquidation amount, given the parameters
 * - Reference: https://github.com/morpho-labs/morpho-liquidation-flash/blob/175823cdaa74894085fc7c1e7ac57b7084f284ed/src/morpho/MorphoAaveAdapter.ts#L33-L75
 *
 * @param collateralTokenInfo - The token info of the collateral token
 * @param totalUserCollateral - The total collateral of the user
 * @param collateralTokenPriceInUSD - The price of the collateral token in USD
 * @param borrowTokenInfo - The token info of the borrowed token
 * @param totalUserDebt - The total debt of the user
 * @param borrowTokenPriceInUSD - The price of the borrowed token in USD
 * @param liquidationBonus - The liquidation bonus
 * @returns - The maximum liquidation amount of the borrower
 */
export function getMaxLiquidationAmountCalculation(
  collateralTokenInfo: TokenInfo,
  totalUserCollateral: BigNumber,
  collateralTokenPriceInUSD: BigNumberish,
  borrowTokenInfo: TokenInfo,
  totalUserDebt: BigNumber,
  borrowTokenPriceInUSD: BigNumberish,
  liquidationBonus: BigNumber,
): {
  toLiquidateAmount: BigNumber;
} {
  const totalUserCollateralInUSD = totalUserCollateral
    .mul(collateralTokenPriceInUSD)
    .div(pow10(collateralTokenInfo.decimals));
  // let rewardedUSD = liquidationBonus.eq(0)
  //   ? BigNumber.from(0)
  //   : PercentMath.percentDiv(totalUserCollateralInUSD, liquidationBonus);

  let toLiquidateAmount = totalUserDebt.div(2);
  const toLiquidateAmountInUSD = toLiquidateAmount
    .mul(borrowTokenPriceInUSD)
    .div(pow10(borrowTokenInfo.decimals));

  if (
    PercentMath.percentMul(toLiquidateAmountInUSD, liquidationBonus).gt(
      totalUserCollateralInUSD,
    )
  ) {
    throw new NotProfitableLiquidationError(
      `toLiquidateAmountInUSD: ${toLiquidateAmountInUSD.toString()}, liquidationBonus: ${liquidationBonus.toString()}, totalUserCollateralInUSD: ${totalUserCollateralInUSD.toString()}`,
    );
    // toLiquidateAmount = toLiquidateAmount
    //   .mul(pow10(borrowTokenInfo.decimals))
    //   .div(borrowTokenPriceInUSD); // TODO: verify the formula
    // rewardedUSD = toLiquidateAmount
    //   .mul(borrowTokenPriceInUSD)
    //   .mul(pow10(collateralTokenInfo.decimals))
    //   .div(collateralTokenPriceInUSD)
    //   .div(pow10(borrowTokenInfo.decimals));
  }

  return {
    toLiquidateAmount: toLiquidateAmount,
    // rewardedUSD: Number(
    //   ethers.formatUnits(rewardedUSD.toString(), priceDecimals),
    // ),
  };
}
