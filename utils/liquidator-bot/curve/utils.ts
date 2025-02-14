import axios from "axios";
import { ethers } from "ethers";
import hre from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../../config/config";
import { CurveSwapExtraParams } from "../../../config/types";
import {
  FlashLoanLiquidatorAaveBorrowRepayCurve,
  FlashMintLiquidatorAaveBorrowRepayCurve,
} from "../../../typechain-types";
import { getReserveTokensAddressesFromAddress } from "../../lending/token";
import { fetchTokenInfo } from "../../token";
import {
  FLASH_LOAN_LIQUIDATOR_CURVE_ID,
  FLASH_MINT_LIQUIDATOR_CURVE_ID,
} from "./deploy-ids";

interface CurveRouteResponse {
  _route: string[];
  _swapParams: number[][];
  _pools: string[];
  _basePools: string[];
  _baseTokens: string[];
  _secondBasePools: string[];
  _secondBaseTokens: string[];
}

/**
 * Get the route and swap parameters for a Curve swap
 *
 * @param tokenInAddress Input token address
 * @param tokenOutAddress Output token address
 * @param amountIn Input amount (not in decimal format)
 * @returns Route and swap parameters
 */
export async function getCurveSwapParams(
  tokenInAddress: string,
  tokenOutAddress: string,
  amountIn: number,
): Promise<{
  route: string[];
  swapParams: number[][];
}> {
  // Get the current network name
  const hre: HardhatRuntimeEnvironment = await import("hardhat");
  const config = await getConfig(hre);

  if (!config.curve.tools?.httpServiceHost) {
    throw new Error("Curve tools HTTP service host not configured");
  }

  try {
    const response = await axios.post<CurveRouteResponse>(
      `${config.curve.tools.httpServiceHost}/get-best-route-args`,
      {
        inputTokenAddress: tokenInAddress,
        outputTokenAddress: tokenOutAddress,
        inputAmount: amountIn.toString(),
        network: hre.network.name,
      },
    );

    if (!response.data._route || !response.data._swapParams) {
      throw new Error("Failed to get Curve swap params");
    }

    // If the return route is all ZeroAddress, then throw an error
    if (response.data._route.every((route) => route === ethers.ZeroAddress)) {
      throw new Error(
        `No route found for ${tokenInAddress} to ${tokenOutAddress} with amount ${amountIn}`,
      );
    }

    return {
      route: response.data._route,
      swapParams: response.data._swapParams,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Failed to get Curve swap params: ${error.response?.data?.error || error.message}`,
      );
    }
    throw error;
  }
}

/**
 * Get the Curve flash mint liquidator bot contract
 *
 * @param callerAddress - Address of the caller
 * @returns The flash mint liquidator bot contract
 */
export async function getCurveFlashMintLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashMintLiquidatorAaveBorrowRepayCurve }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_MINT_LIQUIDATOR_CURVE_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_MINT_LIQUIDATOR_CURVE_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashMintLiquidatorAaveBorrowRepayCurve",
    liquidatorBotDeployment.address,
    signer,
  );

  return {
    contract: contract,
  };
}

/**
 * Get the Curve flash loan liquidator bot contract
 *
 * @param callerAddress - Address of the caller
 * @returns The flash loan liquidator bot contract
 */
export async function getCurveFlashLoanLiquidatorBot(
  callerAddress: string,
): Promise<{ contract: FlashLoanLiquidatorAaveBorrowRepayCurve }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_LOAN_LIQUIDATOR_CURVE_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_LOAN_LIQUIDATOR_CURVE_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashLoanLiquidatorAaveBorrowRepayCurve",
    liquidatorBotDeployment.address,
    signer,
  );

  return {
    contract: contract,
  };
}

/**
 * Perform the liquidation using Curve for swaps
 *
 * @param borrowerAccountAddress - Address of the borrower
 * @param liquidatorAccountAddress - Address of the liquidator
 * @param borrowTokenAddress - Address of the borrow token
 * @param collateralTokenAddress - Address of the collateral token
 * @param repayAmount - Amount to repay
 * @param flashMintLiquidatorBotContract - The flash mint liquidator bot contract
 * @param flashLoanLiquidatorBotContract - The flash loan liquidator bot contract
 * @returns The transaction hash
 */
export async function performCurveLiquidationDefault(
  borrowerAccountAddress: string,
  liquidatorAccountAddress: string,
  borrowTokenAddress: string,
  collateralTokenAddress: string,
  repayAmount: bigint,
  flashMintLiquidatorBotContract:
    | FlashMintLiquidatorAaveBorrowRepayCurve
    | undefined,
  flashLoanLiquidatorBotContract:
    | FlashLoanLiquidatorAaveBorrowRepayCurve
    | undefined,
): Promise<string> {
  const config = await getConfig(hre);

  if (!config.liquidatorBotCurve) {
    throw new Error("Liquidator bot Curve config is not found");
  }

  return performCurveLiquidationImplementation(
    borrowerAccountAddress,
    liquidatorAccountAddress,
    borrowTokenAddress,
    collateralTokenAddress,
    repayAmount,
    config.liquidatorBotCurve.dUSDAddress,
    config.liquidatorBotCurve.isUnstakeTokens,
    config.liquidatorBotCurve.defaultSwapParamsList,
    flashMintLiquidatorBotContract,
    flashLoanLiquidatorBotContract,
  );
}

/**
 * Perform the liquidation using Curve for swaps
 *
 * @param borrowerAccountAddress - Address of the borrower
 * @param liquidatorAccountAddress - Address of the liquidator
 * @param borrowTokenAddress - Address of the borrow token
 * @param collateralTokenAddress - Address of the collateral token
 * @param repayAmount - Amount to repay
 * @param dUSDAddress - Address of the DUSD token
 * @param isUnstakeTokens - Mapping from token address to whether it requires unstaking
 * @param defaultSwapParamsList - List of default swap parameters
 * @param flashMintLiquidatorBotContract - The flash mint liquidator bot contract (only required if the borrow token is DUSD)
 * @param flashLoanLiquidatorBotContract - The flash loan liquidator bot contract (only required if the borrow token is not DUSD)
 * @returns The transaction hash
 */
export async function performCurveLiquidationImplementation(
  borrowerAccountAddress: string,
  liquidatorAccountAddress: string,
  borrowTokenAddress: string,
  collateralTokenAddress: string,
  repayAmount: bigint,
  dUSDAddress: string,
  isUnstakeTokens: { [tokenAddress: string]: boolean },
  defaultSwapParamsList: {
    readonly inputToken: string;
    readonly outputToken: string;
    readonly swapExtraParams: CurveSwapExtraParams;
    readonly reverseSwapExtraParams: CurveSwapExtraParams;
  }[],
  flashMintLiquidatorBotContract:
    | FlashMintLiquidatorAaveBorrowRepayCurve
    | undefined,
  flashLoanLiquidatorBotContract:
    | FlashLoanLiquidatorAaveBorrowRepayCurve
    | undefined,
): Promise<string> {
  const collateralTokenInfo = await fetchTokenInfo(hre, collateralTokenAddress);
  const borrowTokenInfo = await fetchTokenInfo(hre, borrowTokenAddress);

  const collateralReverseAddresses = await getReserveTokensAddressesFromAddress(
    collateralTokenInfo.address,
  );
  const borrowReverseAddresses = await getReserveTokensAddressesFromAddress(
    borrowTokenInfo.address,
  );

  let swapData = "0x";
  // TODO: We temporarily disable this because it's not working, will need to fix it
  //
  // if (borrowTokenInfo.address !== collateralTokenInfo.address) {
  //   const params = await getCurveSwapParams(
  //     collateralTokenInfo.address,
  //     borrowTokenInfo.address,
  //     1,
  //   );
  //   const config = await getConfig(hre);
  //   if (!config.liquidatorBotCurve) {
  //     throw new Error("Liquidator bot Curve config is not found");
  //   }
  //   swapData = ethers.AbiCoder.defaultAbiCoder().encode(
  //     ["address[11]", "uint256[4][5]", "uint256"],
  //     [params.route, params.swapParams, config.liquidatorBotCurve.defaultSwapSlippageBufferBps]
  //   );
  // }

  if (dUSDAddress === "") {
    throw new Error("dUSD address cannot be empty");
  }

  const isUnstakeToken = isUnstakeTokens[collateralTokenInfo.address] == true;

  if (isUnstakeToken) {
    console.log("Unstake token detected, checking for swap path");

    const unstakeCollateralToken = await getERC4626UnderlyingAsset(
      collateralTokenInfo.address,
    );

    console.log("Unstake collateral token", unstakeCollateralToken);

    let hasPathForUnstakeCollateralToken = false;

    // Make sure there is a swap path for the unstake collateral token
    for (const swapParamsData of defaultSwapParamsList) {
      const routeLowercase = swapParamsData.swapExtraParams.route.map((route) =>
        route.toLowerCase(),
      );

      if (routeLowercase.includes(unstakeCollateralToken.toLowerCase())) {
        hasPathForUnstakeCollateralToken = true;
        break;
      }
    }

    if (!hasPathForUnstakeCollateralToken) {
      throw new Error(
        `No swap path found for unstake collateral token ${unstakeCollateralToken}`,
      );
    }
  }

  if (borrowTokenInfo.address === dUSDAddress) {
    if (!flashMintLiquidatorBotContract) {
      throw new Error("Flash mint liquidator bot contract is not found");
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
        isUnstakeToken,
        swapData,
      );
    const receipt = await txn.wait();
    console.log("Liquidation gas used:", receipt?.gasUsed);
    console.log("Liquidation transaction hash:", receipt?.hash);
    return receipt?.hash as string;
  } else {
    if (!flashLoanLiquidatorBotContract) {
      throw new Error("Flash loan liquidator bot contract is not found");
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
        isUnstakeToken,
        swapData,
      );
    const receipt = await txn.wait();
    console.log("Liquidation gas used:", receipt?.gasUsed);
    console.log("Liquidation transaction hash:", receipt?.hash);
    return receipt?.hash as string;
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
): Promise<{ contract: FlashMintLiquidatorAaveBorrowRepayCurve }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_MINT_LIQUIDATOR_CURVE_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_MINT_LIQUIDATOR_CURVE_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashMintLiquidatorAaveBorrowRepayCurve",
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
): Promise<{ contract: FlashLoanLiquidatorAaveBorrowRepayCurve }> {
  const signer = await hre.ethers.getSigner(callerAddress);

  const liquidatorBotDeployment = await hre.deployments.get(
    FLASH_LOAN_LIQUIDATOR_CURVE_ID,
  );

  if (!liquidatorBotDeployment) {
    throw new Error(
      `${FLASH_LOAN_LIQUIDATOR_CURVE_ID} bot deployment not found`,
    );
  }

  const contract = await hre.ethers.getContractAt(
    "FlashLoanLiquidatorAaveBorrowRepayCurve",
    liquidatorBotDeployment.address,
    signer,
  );

  return {
    contract: contract,
  };
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

  if (config.liquidatorBotCurve) {
    if (config.liquidatorBotCurve.proxyContractMap[tokenAddress]) {
      return config.liquidatorBotCurve.proxyContractMap[tokenAddress];
    }

    return tokenAddress;
  }

  if (config.liquidatorBotUniswapV3) {
    if (config.liquidatorBotUniswapV3.proxyContractMap[tokenAddress]) {
      return config.liquidatorBotUniswapV3.proxyContractMap[tokenAddress];
    }

    return tokenAddress;
  }

  throw new Error(
    "Liquidator bot config is not found for both Curve and UniswapV3",
  );
}
