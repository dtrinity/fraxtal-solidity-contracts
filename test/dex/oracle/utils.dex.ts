import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FeeAmount, Position } from "@uniswap/v3-sdk";
import chai from "chai";
import { Addressable, ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import {
  ERC20Test,
  NFTDescriptor,
  NonfungiblePositionManager,
  NonfungibleTokenPositionDescriptor,
  SwapRouter,
  UniswapV3Factory,
  UniswapV3Pool,
  WETH9,
} from "../../../typechain-types";
import { deployContract, DeployContractResult } from "../../../utils/deploy";
import {
  addPoolLiquidity,
  deployAndInitializePool,
} from "../../../utils/dex/pool";
import { fetchTokenInfo } from "../../../utils/token";

/**
 * Deploy the Uniswap V3 contracts
 *
 * @param hre - Hardhat Runtime Environment
 * @returns The deployed contracts
 */
export async function deployDEX(hre: HardhatRuntimeEnvironment): Promise<{
  weth9: WETH9;
  factory: UniswapV3Factory;
  router: SwapRouter;
  nftDescriptorLibrary: NFTDescriptor;
  positionDescriptor: NonfungibleTokenPositionDescriptor;
  nftPositionManager: NonfungiblePositionManager;
}> {
  // TODO: remove this function
  // Get the signer to deploy the contract
  const { dexDeployer } = await hre.getNamedAccounts();
  chai.assert.isDefined(dexDeployer);
  chai.assert.isNotEmpty(dexDeployer);

  const deployer = await hre.ethers.getSigner(dexDeployer);

  const weth9 = await deployWETH9(hre, deployer);
  const factory = await deployFactory(hre, deployer);
  const router = await deployRouter(
    hre,
    deployer,
    factory.address,
    weth9.address,
  );
  const nftDescriptorLibrary = await deployNFTDescriptorLibrary(hre, deployer);
  const positionDescriptor = await deployPositionDescriptor(
    hre,
    deployer,
    nftDescriptorLibrary.address,
    weth9.address,
  );
  const nftPositionManager = await deployNonfungiblePositionManager(
    hre,
    deployer,
    factory.address,
    weth9.address,
    positionDescriptor.address,
  );

  return {
    weth9: await hre.ethers.getContractAt("WETH9", weth9.address, deployer),
    factory: await hre.ethers.getContractAt(
      "UniswapV3Factory",
      factory.address,
      deployer,
    ),
    router: await hre.ethers.getContractAt(
      "SwapRouter",
      router.address,
      deployer,
    ),
    nftDescriptorLibrary: await hre.ethers.getContractAt(
      "NFTDescriptor",
      nftDescriptorLibrary.address,
      deployer,
    ),
    positionDescriptor: await hre.ethers.getContractAt(
      "NonfungibleTokenPositionDescriptor",
      positionDescriptor.address,
      deployer,
    ),
    nftPositionManager: await hre.ethers.getContractAt(
      "NonfungiblePositionManager",
      nftPositionManager.address,
      deployer,
    ),
  };
}

/**
 * Deploy the WETH9 contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param contractOwner - The owner wallet's signer
 * @returns The deployment result
 */
async function deployWETH9(
  hre: HardhatRuntimeEnvironment,
  contractOwner: HardhatEthersSigner,
): Promise<DeployContractResult> {
  // The WETH9 will be automatically found in contracts/dependencies/WETH9.sol
  return deployContract(
    hre,
    "WETH9",
    [],
    undefined, // auto-filling gas limit
    contractOwner,
  );
}

/**
 * Deploy the Uniswap V3 factory contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param contractOwner - The owner wallet's signer
 * @returns The deployment result
 */
async function deployFactory(
  hre: HardhatRuntimeEnvironment,
  contractOwner: HardhatEthersSigner,
): Promise<DeployContractResult> {
  // The UniswapV3Factory will be automatically found in contracts/dex/core/UniswapV3Factory.sol
  return deployContract(
    hre,
    "UniswapV3Factory",
    [],
    undefined, // auto-filling gas limit
    contractOwner,
  );
}

/**
 * Deploy the Uniswap V3 router contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param contractOwner - The owner wallet's signer
 * @param factoryAddress - The address of the Uniswap V3 factory contract
 * @param weth9Address - The address of the WETH9 contract
 * @returns The deployment result
 */
async function deployRouter(
  hre: HardhatRuntimeEnvironment,
  contractOwner: HardhatEthersSigner,
  factoryAddress: string | Addressable,
  weth9Address: string | Addressable,
): Promise<DeployContractResult> {
  // The SwapRouter will be automatically found in contracts/dex/periphery/SwapRouter.sol
  return deployContract(
    hre,
    "SwapRouter",
    [factoryAddress, weth9Address],
    undefined, // auto-filling gas limit
    contractOwner,
  );
}

/**
 * Deploy the NFT descriptor library contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param contractOwner - The owner wallet's signer
 * @returns The deployment result
 */
async function deployNFTDescriptorLibrary(
  hre: HardhatRuntimeEnvironment,
  contractOwner: HardhatEthersSigner,
): Promise<DeployContractResult> {
  // The NFTDescriptor will be automatically found in contracts/dex/periphery/NFTDescriptor.sol
  return deployContract(
    hre,
    "NFTDescriptor",
    [],
    undefined, // auto-filling gas limit
    contractOwner,
  );
}

/**
 * Deploy the position descriptor contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param contractOwner - The owner wallet's signer
 * @param nftDescriptorLibraryAddress - The address of the NFT descriptor library contract
 * @param weth9Address - The address of the WETH9 contract
 * @returns The deployment result
 */
async function deployPositionDescriptor(
  hre: HardhatRuntimeEnvironment,
  contractOwner: HardhatEthersSigner,
  nftDescriptorLibraryAddress: string | Addressable,
  weth9Address: string | Addressable,
): Promise<DeployContractResult> {
  const nativeCurrencyLabelBytes = ethers.encodeBytes32String("WETH");

  // The NonfungibleTokenPositionDescriptor will be automatically found in contracts/dex/periphery/NonfungibleTokenPositionDescriptor.sol
  return deployContract(
    hre,
    "NonfungibleTokenPositionDescriptor",
    [weth9Address, nativeCurrencyLabelBytes],
    undefined, // auto-filling gas limit
    contractOwner,
    {
      NFTDescriptor: nftDescriptorLibraryAddress.toString(),
    },
  );
}

/**
 * Deploy the Uniswap V3 Nonfungible Position Manager contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param contractOwner - The owner wallet's signer
 * @param factoryAddress - The address of the Uniswap V3 factory contract
 * @param weth9Address - The address of the WETH9 contract
 * @param positionDescriptorAddress - The address of the position descriptor contract
 * @returns The deployment result
 */
async function deployNonfungiblePositionManager(
  hre: HardhatRuntimeEnvironment,
  contractOwner: HardhatEthersSigner,
  factoryAddress: string | Addressable,
  weth9Address: string | Addressable,
  positionDescriptorAddress: string | Addressable,
): Promise<DeployContractResult> {
  // The NonfungiblePositionManager will be automatically found in contracts/dex/periphery/NonfungiblePositionManager.sol
  return deployContract(
    hre,
    "NonfungiblePositionManager",
    [factoryAddress, weth9Address, positionDescriptorAddress],
    undefined, // auto-filling gas limit
    contractOwner,
  );
}

/**
 * Initialize the pool
 *
 * @param hre - Hardhat Runtime Environment
 * @param dexDeployer - The address of the DEX deployer
 * @param dexLiquidityAdder - The address of the DEX liquidity adder
 * @param poolConfigs - The pool configurations to deploy and initialize
 * @returns The pool deployment and initialization results
 */
export async function initDEXPool(
  hre: HardhatRuntimeEnvironment,
  dexDeployer: string,
  dexLiquidityAdder: string,
  poolConfigs: {
    token0: string;
    token1: string;
    fee: FeeAmount;
    initialPriceRatio: { amount0: number; amount1: number };
    initialToken0Amount: number;
  }[],
): Promise<{
  pools: UniswapV3Pool[];
}> {
  chai.assert.isDefined(dexDeployer);
  chai.assert.isNotEmpty(dexDeployer);
  chai.assert.isDefined(dexLiquidityAdder);
  chai.assert.isNotEmpty(dexLiquidityAdder);

  const gasLimits = {
    deployPool: undefined,
    addLiquidity: undefined,
  };
  const deadlineInSeconds = 60000000;

  const pools: UniswapV3Pool[] = [];

  for (const poolConfig of poolConfigs) {
    chai.assert.notEqual(poolConfig.token0, poolConfig.token1);
    chai.assert.notEqual(poolConfig.initialPriceRatio.amount0, 0);
    chai.assert.notEqual(poolConfig.initialPriceRatio.amount1, 0);
    chai.assert.notEqual(poolConfig.initialToken0Amount, 0);
    chai.assert.notEqual(poolConfig.fee, 0);

    const poolRes = await deployAndInitializePool(
      hre,
      poolConfig.token0,
      poolConfig.token1,
      poolConfig.fee,
      poolConfig.initialPriceRatio,
      poolConfig.initialToken0Amount,
      await hre.ethers.getSigner(dexDeployer),
      await hre.ethers.getSigner(dexLiquidityAdder),
      gasLimits,
      deadlineInSeconds,
    );

    pools.push(
      await hre.ethers.getContractAt(
        "UniswapV3Pool",
        poolRes.poolDeploymentResult.poolAddress,
      ),
    );
  }

  return {
    pools,
  };
}

/**
 * Add liquidity to the DEX pool
 *
 * @param hre - Hardhat Runtime Environment
 * @param dexFactoryAddress - DEX factory address
 * @param token0Address - Token0 address
 * @param token1Address - Token1 address
 * @param fee - Fee amount
 * @param inputToken0Amount - Input token0 amount
 * @param liquidityAdder - Liquidity adder address
 * @returns The added position
 */
export async function addLiquidityToDEXPool(
  hre: HardhatRuntimeEnvironment,
  dexFactoryAddress: string,
  token0Address: string,
  token1Address: string,
  fee: FeeAmount,
  inputToken0Amount: number,
  liquidityAdder: string,
): Promise<Position> {
  const poolAddress = await getPoolAddress(
    hre,
    dexFactoryAddress,
    token0Address,
    token1Address,
    fee,
  );

  const token0Info = await fetchTokenInfo(hre, token0Address.toString());
  const token1Info = await fetchTokenInfo(hre, token1Address.toString());

  // Add liquidity to the pool
  const addLiquidityResult = await addPoolLiquidity(
    hre,
    poolAddress,
    token0Info,
    token1Info,
    inputToken0Amount,
    await hre.ethers.getSigner(liquidityAdder),
    undefined, // auto-filling gas limit
    60000000, // deadline in seconds
  );

  return addLiquidityResult.position;
}

/**
 * Get the DEX pool address
 *
 * @param hre - Hardhat Runtime Environment
 * @param dexFactoryAddress - DEX factory address
 * @param token0Address - Token0 address
 * @param token1Address - Token1 address
 * @param fee - Fee amount
 * @returns The DEX pool address
 */
export async function getPoolAddress(
  hre: HardhatRuntimeEnvironment,
  dexFactoryAddress: string,
  token0Address: string,
  token1Address: string,
  fee: FeeAmount,
): Promise<string> {
  const dexFactoryContract = await hre.ethers.getContractAt(
    "UniswapV3Factory",
    dexFactoryAddress,
  );
  return dexFactoryContract.getPool(token0Address, token1Address, fee);
}

/**
 * Get the DEX pool from the address
 *
 * @param hre - Hardhat Runtime Environment
 * @param poolAddress - DEX pool address
 * @returns The DEX pool contract
 */
export async function getPoolFromAddress(
  hre: HardhatRuntimeEnvironment,
  poolAddress: string,
): Promise<UniswapV3Pool> {
  return await hre.ethers.getContractAt("UniswapV3Pool", poolAddress);
}

/**
 * Swap exact input token for output token (no slippage constraint)
 *
 * @param hre - Hardhat Runtime Environment
 * @param dexRouter - DEX router contract
 * @param tokenInContract - Input token contract
 * @param tokenOutContract - Output token contract
 * @param feeTier - Fee tier
 * @param senderAddress - Sender address (signer and recipient)
 * @param amountIn - Input token amount
 */
export async function swapExactInputSimple(
  hre: HardhatRuntimeEnvironment,
  dexRouter: SwapRouter,
  tokenInContract: ERC20Test,
  tokenOutContract: ERC20Test,
  feeTier: FeeAmount,
  senderAddress: string,
  amountIn: bigint,
): Promise<void> {
  // Approve the router to spend the token
  await tokenInContract
    .connect(
      await hre.ethers.getSigner(senderAddress), // the signer
    )
    .approve(await dexRouter.getAddress(), amountIn);

  // Perform a swap
  const res = await dexRouter
    .connect(
      // the signer
      await hre.ethers.getSigner(senderAddress),
    )
    .exactInputSingle({
      tokenIn: await tokenInContract.getAddress(),
      tokenOut: await tokenOutContract.getAddress(),
      fee: feeTier,
      recipient: senderAddress,
      deadline: 6000000000,
      amountIn: amountIn.toString(),
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0, // no price limit
    });
  await res.wait();
}
