import hre, { ethers } from "hardhat";

import { getConfig } from "../../../config/config";
import {
  FlashLoanLiquidatorAaveBorrowRepayOdos,
  FlashMintLiquidatorAaveBorrowRepayOdos,
} from "../../../typechain-types";
import { getReserveTokensAddressesFromAddress } from "../../lending/token";
import { OdosClient } from "../../odos/client";
import { fetchTokenInfo } from "../../token";
import {
  FLASH_LOAN_LIQUIDATOR_ODOS_ID,
  FLASH_MINT_LIQUIDATOR_ODOS_ID,
} from "./deploy-ids";

/**
 * Get the Odos flash mint liquidator bot contract
 *
 * @param callerAddress - The address of the caller
 * @returns The flash mint liquidator bot contract
 */
export async function getOdosFlashMintLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashMintLiquidatorAaveBorrowRepayOdos }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_MINT_LIQUIDATOR_ODOS_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_MINT_LIQUIDATOR_ODOS_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashMintLiquidatorAaveBorrowRepayOdos",
    liquidatorBotDeployment.address,
    signer,
  );

  return { contract };
}

/**
 * Get the Odos flash loan liquidator bot contract
 *
 * @param callerAddress - The address of the caller
 * @returns The flash loan liquidator bot contract
 */
export async function getOdosFlashLoanLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashLoanLiquidatorAaveBorrowRepayOdos }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_LOAN_LIQUIDATOR_ODOS_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_LOAN_LIQUIDATOR_ODOS_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashLoanLiquidatorAaveBorrowRepayOdos",
    liquidatorBotDeployment.address,
    signer,
  );

  return { contract };
}

/**
 * Get Odos swap quote and assembled transaction data
 *
 * @param collateralTokenAddress - The address of the collateral token
 * @param borrowTokenAddress - The address of the borrow token
 * @param repayAmount - The amount of the repay
 * @param liquidatorAccountAddress - The address of the liquidator
 * @param chainId - The chain ID
 * @param odosClient - The Odos client
 * @param isUnstakeToken - Whether the collateral token needs to be unstaked
 * @returns The quote and the collateral token
 */
async function getOdosSwapQuote(
  collateralTokenAddress: string,
  borrowTokenAddress: string,
  repayAmount: bigint,
  liquidatorAccountAddress: string,
  chainId: number,
  odosClient: OdosClient,
  isUnstakeToken: boolean,
): Promise<{ quote: any; collateralToken: any }> {
  const collateralToken = await hre.ethers.getContractAt(
    "IERC20Detailed",
    collateralTokenAddress,
  );
  const borrowToken = await hre.ethers.getContractAt(
    "IERC20Detailed",
    borrowTokenAddress,
  );
  const collateralDecimals = await collateralToken.decimals();
  const borrowDecimals = await borrowToken.decimals();

  const readableRepayAmount = OdosClient.parseTokenAmount(
    repayAmount.toString(),
    Number(borrowDecimals),
  );

  let effectiveCollateralAddress = collateralTokenAddress;

  if (isUnstakeToken) {
    effectiveCollateralAddress = await getERC4626UnderlyingAsset(
      collateralTokenAddress,
    );
    console.log(
      "Using unstaked collateral token for quote:",
      effectiveCollateralAddress,
    );
  }

  const swapSlippageBufferPercentage = 0.5; // 0.5% buffer

  const inputAmount = await odosClient.calculateInputAmount(
    readableRepayAmount,
    borrowTokenAddress,
    effectiveCollateralAddress,
    chainId,
    swapSlippageBufferPercentage,
  );

  const formattedInputAmount = OdosClient.formatTokenAmount(
    inputAmount,
    Number(collateralDecimals),
  );

  const quoteRequest = {
    chainId: chainId,
    inputTokens: [
      {
        tokenAddress: effectiveCollateralAddress,
        amount: formattedInputAmount,
      },
    ],
    outputTokens: [{ tokenAddress: borrowTokenAddress, proportion: 1 }],
    userAddr: liquidatorAccountAddress,
    slippageLimitPercent: swapSlippageBufferPercentage,
  };

  const quote = await odosClient.getQuote(quoteRequest);
  return { quote, collateralToken };
}

/**
 * Execute liquidation with flash mint
 *
 * @param flashMintLiquidatorBotContract - The flash mint liquidator bot contract
 * @param quote - The quote
 * @param collateralToken - The collateral token
 * @param odosRouter - The Odos router
 * @param signer - The signer
 * @param odosClient - The Odos client
 * @param params - The parameters
 * @param params.borrowerAccountAddress - The address of the borrower
 * @param params.borrowTokenAddress - The address of the borrow token
 * @param params.collateralTokenAddress - The address of the collateral token
 * @param params.repayAmount - The amount of the repay
 * @param params.chainId - The chain ID
 * @param params.liquidatorAccountAddress - The address of the liquidator
 * @param params.isUnstakeToken - Whether the collateral token needs to be unstaked
 * @returns The transaction hash
 */
async function executeFlashMintLiquidation(
  flashMintLiquidatorBotContract: FlashMintLiquidatorAaveBorrowRepayOdos,
  quote: any,
  collateralToken: any,
  odosRouter: string,
  signer: any,
  odosClient: OdosClient,
  params: {
    borrowerAccountAddress: string;
    borrowTokenAddress: string;
    collateralTokenAddress: string;
    repayAmount: bigint;
    chainId: number;
    liquidatorAccountAddress: string;
    isUnstakeToken: boolean;
  },
): Promise<string> {
  const assembledQuote = await getAssembledQuote(
    collateralToken,
    odosRouter,
    signer,
    odosClient,
    quote,
    params,
    await flashMintLiquidatorBotContract.getAddress(),
  );

  const collateralTokenInfo = await fetchTokenInfo(
    hre,
    params.collateralTokenAddress,
  );
  const borrowTokenInfo = await fetchTokenInfo(hre, params.borrowTokenAddress);

  const collateralReverseAddresses = await getReserveTokensAddressesFromAddress(
    collateralTokenInfo.address,
  );
  const borrowReverseAddresses = await getReserveTokensAddressesFromAddress(
    borrowTokenInfo.address,
  );

  const tx = await flashMintLiquidatorBotContract.liquidate(
    borrowReverseAddresses.aTokenAddress,
    collateralReverseAddresses.aTokenAddress,
    params.borrowerAccountAddress,
    params.repayAmount,
    false,
    params.isUnstakeToken,
    assembledQuote.transaction.data,
  );
  const receipt = await tx.wait();
  return receipt?.hash as string;
}

/**
 * Execute liquidation with flash loan
 *
 * @param flashLoanLiquidatorBotContract - The flash loan liquidator bot contract
 * @param quote - The quote
 * @param collateralToken - The collateral token
 * @param odosRouter - The Odos router
 * @param signer - The signer
 * @param odosClient - The Odos client
 * @param params - The parameters
 * @param params.borrowerAccountAddress - The address of the borrower
 * @param params.borrowTokenAddress - The address of the borrow token
 * @param params.collateralTokenAddress - The address of the collateral token
 * @param params.repayAmount - The amount of the repay
 * @param params.chainId - The chain ID
 * @param params.liquidatorAccountAddress - The address of the liquidator
 * @param params.isUnstakeToken - Whether the collateral token needs to be unstaked
 * @returns The transaction hash
 */
async function executeFlashLoanLiquidation(
  flashLoanLiquidatorBotContract: FlashLoanLiquidatorAaveBorrowRepayOdos,
  quote: any,
  collateralToken: any,
  odosRouter: string,
  signer: any,
  odosClient: OdosClient,
  params: {
    borrowerAccountAddress: string;
    borrowTokenAddress: string;
    collateralTokenAddress: string;
    repayAmount: bigint;
    chainId: number;
    liquidatorAccountAddress: string;
    isUnstakeToken: boolean;
  },
): Promise<string> {
  const assembledQuote = await getAssembledQuote(
    collateralToken,
    odosRouter,
    signer,
    odosClient,
    quote,
    params,
    await flashLoanLiquidatorBotContract.getAddress(),
  );

  const collateralTokenInfo = await fetchTokenInfo(
    hre,
    params.collateralTokenAddress,
  );
  const borrowTokenInfo = await fetchTokenInfo(hre, params.borrowTokenAddress);

  const collateralReverseAddresses = await getReserveTokensAddressesFromAddress(
    collateralTokenInfo.address,
  );
  const borrowReverseAddresses = await getReserveTokensAddressesFromAddress(
    borrowTokenInfo.address,
  );

  const tx = await flashLoanLiquidatorBotContract.liquidate(
    borrowReverseAddresses.aTokenAddress,
    collateralReverseAddresses.aTokenAddress,
    params.borrowerAccountAddress,
    params.repayAmount,
    false,
    params.isUnstakeToken,
    assembledQuote.transaction.data,
  );
  const receipt = await tx.wait();
  return receipt?.hash as string;
}

/**
 * Get assembled quote from Odos with required approvals
 *
 * @param collateralToken - The collateral token
 * @param odosRouter - The Odos router
 * @param signer - The signer
 * @param odosClient - The Odos client
 * @param quote - The quote
 * @param params - The parameters
 * @param params.chainId - The chain ID
 * @param params.liquidatorAccountAddress - The address of the liquidator
 * @param receiverAddress - The address of the receiver
 * @returns The assembled quote
 */
async function getAssembledQuote(
  collateralToken: any,
  odosRouter: string,
  signer: any,
  odosClient: OdosClient,
  quote: any,
  params: {
    chainId: number;
    liquidatorAccountAddress: string;
  },
  receiverAddress: string,
): Promise<any> {
  const approveRouterTx = await collateralToken
    .connect(signer)
    .approve(odosRouter, quote.inAmounts[0]);
  await approveRouterTx.wait();

  const assembleRequest = {
    chainId: params.chainId,
    pathId: quote.pathId,
    userAddr: params.liquidatorAccountAddress,
    simulate: false,
    receiver: receiverAddress,
  };
  const assembled = await odosClient.assembleTransaction(assembleRequest);

  const approveSwapperTx = await collateralToken
    .connect(signer)
    .approve(receiverAddress, quote.inAmounts[0]);
  await approveSwapperTx.wait();

  return assembled;
}

/**
 * Perform the liquidation using Odos for swaps
 *
 * @param borrowerAccountAddress - The address of the borrower
 * @param liquidatorAccountAddress - The address of the liquidator
 * @param borrowTokenAddress - The address of the borrow token
 * @param collateralTokenAddress - The address of the collateral token
 * @param repayAmount - The amount of the repay
 * @param flashMintLiquidatorBotContract - The flash mint liquidator bot contract
 * @param flashLoanLiquidatorBotContract - The flash loan liquidator bot contract
 * @returns The transaction hash
 */
export async function performOdosLiquidationDefault(
  borrowerAccountAddress: string,
  liquidatorAccountAddress: string,
  borrowTokenAddress: string,
  collateralTokenAddress: string,
  repayAmount: bigint,
  flashMintLiquidatorBotContract:
    | FlashMintLiquidatorAaveBorrowRepayOdos
    | undefined,
  flashLoanLiquidatorBotContract:
    | FlashLoanLiquidatorAaveBorrowRepayOdos
    | undefined,
): Promise<string> {
  const config = await getConfig(hre);
  const signer = await hre.ethers.getSigner(liquidatorAccountAddress);

  if (!config.liquidatorBotOdos) {
    throw new Error("Liquidator bot Odos config is not found");
  }

  const { odosApiUrl, odosRouter, isUnstakeTokens } = config.liquidatorBotOdos;
  const network = await hre.ethers.provider.getNetwork();
  const odosClient = new OdosClient(odosApiUrl);
  const chainId = Number(network.chainId);

  const collateralTokenInfo = await fetchTokenInfo(hre, collateralTokenAddress);
  const borrowTokenInfo = await fetchTokenInfo(hre, borrowTokenAddress);
  const isUnstakeToken = isUnstakeTokens[collateralTokenInfo.address] === true;

  if (isUnstakeToken) {
    console.log("Unstake token detected, checking for underlying asset");
    const unstakeCollateralToken = await getERC4626UnderlyingAsset(
      collateralTokenInfo.address,
    );
    console.log("Unstake collateral token:", unstakeCollateralToken);
  }

  const { quote, collateralToken } = await getOdosSwapQuote(
    collateralTokenAddress,
    borrowTokenAddress,
    repayAmount,
    liquidatorAccountAddress,
    chainId,
    odosClient,
    isUnstakeToken,
  );

  const params = {
    borrowerAccountAddress,
    borrowTokenAddress,
    collateralTokenAddress,
    repayAmount,
    chainId,
    liquidatorAccountAddress,
    isUnstakeToken,
  };

  if (borrowTokenInfo.address === config.liquidatorBotOdos.dUSDAddress) {
    if (!flashMintLiquidatorBotContract) {
      throw new Error("Flash mint liquidator bot contract not found");
    }

    console.log("Liquidating with flash minting");

    return await executeFlashMintLiquidation(
      flashMintLiquidatorBotContract,
      quote,
      collateralToken,
      odosRouter,
      signer,
      odosClient,
      params,
    );
  } else {
    if (!flashLoanLiquidatorBotContract) {
      throw new Error("Flash loan liquidator bot contract not found");
    }

    console.log("Liquidating with flash loan");

    return await executeFlashLoanLiquidation(
      flashLoanLiquidatorBotContract,
      quote,
      collateralToken,
      odosRouter,
      signer,
      odosClient,
      params,
    );
  }
}

/**
 * Get the underlying asset of an ERC4626 token
 * - If the token is not an ERC4626 token, throw an error
 * - If the token is the zero address, throw an error
 *
 * @param tokenAddress - Address of the ERC4626 token
 * @returns The underlying asset address
 */
export async function getERC4626UnderlyingAsset(
  tokenAddress: string,
): Promise<string> {
  if (tokenAddress === ethers.ZeroAddress || tokenAddress === "") {
    throw new Error(
      `Token address cannot be zero address or empty: ${tokenAddress}`,
    );
  }

  const { dexDeployer } = await hre.getNamedAccounts();

  const actualTokenAddress = await getProxyContract(tokenAddress);
  console.log("Actual token address", actualTokenAddress);

  const erc4626Contract = await hre.ethers.getContractAt(
    ["function asset() external view returns (address)"],
    actualTokenAddress,
    await hre.ethers.getSigner(dexDeployer),
  );

  // If the token is not an ERC4626 token, throw an error
  try {
    return await erc4626Contract.asset();
  } catch (error) {
    console.log("Error getting ERC4626 underlying asset", error);
    const tokenInfo = await fetchTokenInfo(hre, tokenAddress);
    throw new Error(
      `Token ${tokenInfo.symbol} is not an ERC4626 token: ${error}`,
    );
  }
}

/**
 * Get the proxy contract address for a token
 *
 * @param tokenAddress - Address of the token
 * @returns The proxy contract address
 */
async function getProxyContract(tokenAddress: string): Promise<string> {
  const config = await getConfig(hre);

  if (config.liquidatorBotOdos) {
    if (config.liquidatorBotOdos.proxyContractMap[tokenAddress]) {
      return config.liquidatorBotOdos.proxyContractMap[tokenAddress];
    }

    return tokenAddress;
  }

  throw new Error("Liquidator bot config is not found for both Odos");
}
