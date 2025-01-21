import hre from "hardhat";

import { getConfig } from "../../../config/config";
import {
  FlashLoanLiquidatorAaveBorrowRepayUniswapV3,
  FlashMintLiquidatorAaveBorrowRepayUniswapV3,
} from "../../../typechain-types";
import { UNISWAP_STATIC_ORACLE_WRAPPER_ID } from "../../dex/deploy-ids";
import { getDEXPoolAddressForPair } from "../../dex/pool";
import { convertToSwapPath } from "../../dex/utils";
import { getReserveTokensAddressesFromAddress } from "../../lending/token";
import { fetchTokenInfo, TokenInfo } from "../../token";
import {
  FLASH_LOAN_LIQUIDATOR_UNISWAPV3_ID,
  FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID,
} from "./deploy-ids";

/**
 * Get the swap path for UniswapV3 swaps
 *
 * @param inputTokenInfo - The input token info
 * @param outputTokenInfo - The output token info
 * @param isExactInput - Whether the swap is an exact input swap
 * @returns The swap path
 */
export async function getUniswapV3SwapPath(
  inputTokenInfo: TokenInfo,
  outputTokenInfo: TokenInfo,
  isExactInput: boolean,
): Promise<string> {
  if (inputTokenInfo.address === outputTokenInfo.address) {
    throw new Error(
      `Input token and output token are the same: ${JSON.stringify(inputTokenInfo)} vs. ${JSON.stringify(outputTokenInfo)}`,
    );
  }

  // Get UniswapV3 pool for direct swap
  const { poolAddress: directPoolAddress, fee: directPoolFee } =
    await getDEXPoolAddressForPair(
      outputTokenInfo.address,
      inputTokenInfo.address,
    );

  // If direct pool exists, use it
  if (directPoolAddress !== hre.ethers.ZeroAddress) {
    return convertToSwapPath(
      [inputTokenInfo.address, outputTokenInfo.address],
      [directPoolFee],
      isExactInput,
    );
  }

  // Otherwise use intermediary stablecoin path
  const { address: oracleAddress } = await hre.deployments.get(
    UNISWAP_STATIC_ORACLE_WRAPPER_ID,
  );
  const oracleContract = await hre.ethers.getContractAt(
    "StaticOracleWrapper",
    oracleAddress,
  );
  const stablecoinAddress = await oracleContract.QUOTE_TOKEN();

  // Get pools for input -> stablecoin -> output path
  const { poolAddress: pool1Address, fee: pool1Fee } =
    await getDEXPoolAddressForPair(inputTokenInfo.address, stablecoinAddress);

  const { poolAddress: pool2Address, fee: pool2Fee } =
    await getDEXPoolAddressForPair(stablecoinAddress, outputTokenInfo.address);

  if (
    pool1Address === hre.ethers.ZeroAddress ||
    pool2Address === hre.ethers.ZeroAddress
  ) {
    throw new Error(
      `No valid UniswapV3 path found between ${inputTokenInfo.symbol} and ${outputTokenInfo.symbol}`,
    );
  }

  return convertToSwapPath(
    [inputTokenInfo.address, stablecoinAddress, outputTokenInfo.address],
    [pool1Fee, pool2Fee],
    isExactInput,
  );
}

/**
 * Get the UniswapV3 flash mint liquidator bot contract
 *
 * @param callerAddress - Address of the caller
 * @returns The flash mint liquidator bot contract
 */
export async function getUniswapV3FlashMintLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashMintLiquidatorAaveBorrowRepayUniswapV3 }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashMintLiquidatorAaveBorrowRepayUniswapV3",
    liquidatorBotDeployment.address,
    signer,
  );

  return {
    contract: contract,
  };
}

/**
 * Get the UniswapV3 flash loan liquidator bot contract
 *
 * @param callerAddress - Address of the caller
 * @returns The flash loan liquidator bot contract
 */
export async function getUniswapV3FlashLoanLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashLoanLiquidatorAaveBorrowRepayUniswapV3 }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_LOAN_LIQUIDATOR_UNISWAPV3_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_LOAN_LIQUIDATOR_UNISWAPV3_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashLoanLiquidatorAaveBorrowRepayUniswapV3",
    liquidatorBotDeployment.address,
    signer,
  );

  return {
    contract: contract,
  };
}

/**
 * Perform the liquidation using UniswapV3 for swaps
 *
 * @param borrowerAccountAddress - Address of the borrower
 * @param liquidatorAccountAddress - Address of the liquidator
 * @param borrowTokenAddress - Address of the borrow token
 * @param collateralTokenAddress - Address of the collateral token
 * @param repayAmount - Amount to repay
 * @param flashMintLiquidatorBotContract - The flash mint liquidator bot contract
 * @param flashLoanLiquidatorBotContract - The flash loan liquidator bot contract
 */
export async function performUniswapV3Liquidation(
  borrowerAccountAddress: string,
  liquidatorAccountAddress: string,
  borrowTokenAddress: string,
  collateralTokenAddress: string,
  repayAmount: bigint,
  flashMintLiquidatorBotContract: FlashMintLiquidatorAaveBorrowRepayUniswapV3,
  flashLoanLiquidatorBotContract: FlashLoanLiquidatorAaveBorrowRepayUniswapV3,
): Promise<void> {
  const collateralTokenInfo = await fetchTokenInfo(hre, collateralTokenAddress);
  const borrowTokenInfo = await fetchTokenInfo(hre, borrowTokenAddress);

  const collateralReverseAddresses = await getReserveTokensAddressesFromAddress(
    collateralTokenInfo.address,
  );
  const borrowReverseAddresses = await getReserveTokensAddressesFromAddress(
    borrowTokenInfo.address,
  );

  let path = "0x";

  if (borrowTokenInfo.address !== collateralTokenInfo.address) {
    path = await getUniswapV3SwapPath(
      collateralTokenInfo,
      borrowTokenInfo,
      false,
    );
  }

  const config = await getConfig(hre);

  if (!config.liquidatorBotUniswapV3) {
    throw new Error("Liquidator bot Uniswap V3 config is not found");
  }

  if (
    config.liquidatorBotUniswapV3.dUSDAddress === "" ||
    config.liquidatorBotUniswapV3.dUSDAddress === undefined
  ) {
    throw new Error("dUSD address is not set in the liquidator config");
  }

  if (borrowTokenInfo.address === config.liquidatorBotUniswapV3.dUSDAddress) {
    // Add the liquidatorAccountAddress as a liquidator
    const isLiquidator = await flashMintLiquidatorBotContract.isLiquidator(
      liquidatorAccountAddress,
    );

    if (!isLiquidator) {
      await flashMintLiquidatorBotContract.addLiquidator(
        liquidatorAccountAddress,
      );
    }

    console.log("Liquidating with flash minting");

    const txn = await flashMintLiquidatorBotContract
      .connect(await hre.ethers.getSigner(liquidatorAccountAddress))
      .liquidate(
        borrowReverseAddresses.aTokenAddress,
        collateralReverseAddresses.aTokenAddress,
        borrowerAccountAddress,
        repayAmount,
        false,
        false,
        path,
      );
    const receipt = await txn.wait();
    console.log("Liquidation gas used:", receipt?.gasUsed);
    console.log("Liquidation transaction hash:", receipt?.hash);
  } else {
    // Add the liquidatorAccountAddress as a liquidator
    const isLiquidator = await flashLoanLiquidatorBotContract.isLiquidator(
      liquidatorAccountAddress,
    );

    if (!isLiquidator) {
      await flashLoanLiquidatorBotContract.addLiquidator(
        liquidatorAccountAddress,
      );
    }

    console.log("Liquidating with flash loan");

    const txn = await flashLoanLiquidatorBotContract
      .connect(await hre.ethers.getSigner(liquidatorAccountAddress))
      .liquidate(
        borrowReverseAddresses.aTokenAddress,
        collateralReverseAddresses.aTokenAddress,
        borrowerAccountAddress,
        repayAmount,
        false,
        path,
      );
    const receipt = await txn.wait();
    console.log("Liquidation gas used:", receipt?.gasUsed);
    console.log("Liquidation transaction hash:", receipt?.hash);
  }
}

/**
 * Get the flash mint liquidator bot contract
 *
 * @param callerAddress - Address of the caller
 * @returns The flash mint liquidator bot contract
 */
export async function getFlashMintLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashMintLiquidatorAaveBorrowRepayUniswapV3 }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_MINT_LIQUIDATOR_UNISWAPV3_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashMintLiquidatorAaveBorrowRepayUniswapV3",
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
): Promise<{ contract: FlashLoanLiquidatorAaveBorrowRepayUniswapV3 }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_LOAN_LIQUIDATOR_UNISWAPV3_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_LOAN_LIQUIDATOR_UNISWAPV3_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashLoanLiquidatorAaveBorrowRepayUniswapV3",
    liquidatorBotDeployment.address,
    signer,
  );

  return {
    contract: contract,
  };
}
