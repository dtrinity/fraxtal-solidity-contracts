import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { FeeAmount } from "@uniswap/v3-sdk";
import chai from "chai";
import { Addressable } from "ethers";
import hre, { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfig } from "../../config/config";
import { MintConfig } from "../../config/types";
import { deployContract, DeployContractResult } from "../../utils/deploy";
import { checkPoolData, deployAndInitializePool, DeployAndInitializePoolResult } from "../../utils/dex/pool";
import { DeployTestTokenResult, deployTokensDefault } from "../../utils/token";

describe("Testing DEX", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.

  describe("Create and init pool", function () {
    it("Successful", async function () {
      const { dexDeployer, testTokenOwner1 } = await hre.getNamedAccounts();

      const res = await loadFixture(initPoolForHardhatLocal);

      for (const initPoolResult of res.initPoolResults) {
        await checkPoolData(hre, initPoolResult);
      }

      const deployedTokenResult = res.deployedTokenResult;

      chai.assert.typeOf(deployedTokenResult.Tokens.DUSD.address, "string");
      chai.assert.isNotEmpty(deployedTokenResult.Tokens.DUSD.address);
      chai.assert.typeOf(deployedTokenResult.Tokens.FXS.address, "string");
      chai.assert.isNotEmpty(deployedTokenResult.Tokens.FXS.address);
      chai.assert.typeOf(deployedTokenResult.Tokens.SFRAX.address, "string");
      chai.assert.isNotEmpty(deployedTokenResult.Tokens.SFRAX.address);
      chai.assert.typeOf(deployedTokenResult.Tokens.SFRXETH.address, "string");
      chai.assert.isNotEmpty(deployedTokenResult.Tokens.SFRXETH.address);

      chai.expect(deployedTokenResult.Account.Owner.address).to.equal(dexDeployer);
      chai.expect(deployedTokenResult.Account.ToAddresses).deep.eq([testTokenOwner1, dexDeployer]);
    });
  });
});

/**
 * Deploy the DEX contracts
 *
 * @returns The deployment result with the deployed contract information
 */
async function deployDEXFixture(): Promise<void> {
  return await deployDEX(hre);
}

/**
 * Initialize the pool for localhost
 *
 * @returns The pool deployment and initialization results
 */
async function initPoolForHardhatLocal(): Promise<{
  initPoolResults: DeployAndInitializePoolResult[];
  deployedTokenResult: DeployTestTokenResult;
}> {
  await loadFixture(deployDEXFixture);

  // Print a space line to separate the output
  console.log("");

  const { dexDeployer, dexLiquidityAdder } = await hre.getNamedAccounts();

  const config = await getConfig(hre);
  const mintInfos = config.mintInfos as { [tokenSymbol: string]: MintConfig[] };
  const testTokenInfo = await deployTokensDefault(hre, mintInfos);

  const gasLimits = {
    deployPool: undefined,
    addLiquidity: undefined,
  };

  const initPoolResults = [
    await deployAndInitializePool(
      hre,
      testTokenInfo.Tokens.SFRAX.address,
      testTokenInfo.Tokens.DUSD.address,
      FeeAmount.MEDIUM,
      {
        // Initial price ratio
        amount0: 1.2,
        amount1: 1,
      },
      1000, // Initial token0 amount for adding liquidity
      await hre.ethers.getSigner(dexDeployer),
      await hre.ethers.getSigner(dexLiquidityAdder),
      gasLimits,
      6000, // Deadline in seconds
    ),
  ];

  return {
    initPoolResults: initPoolResults,
    deployedTokenResult: testTokenInfo,
  };
}

/**
 * Deploy the Uniswap V3 contracts
 *
 * @param hre - Hardhat Runtime Environment
 */
async function deployDEX(hre: HardhatRuntimeEnvironment): Promise<void> {
  // TODO: remove this function
  // Get the signer to deploy the contract
  const { dexDeployer } = await hre.getNamedAccounts();

  const deployer = await hre.ethers.getSigner(dexDeployer);

  const weth9 = await deployWETH9(hre, deployer);
  const factory = await deployFactory(hre, deployer);
  await deployRouter(hre, deployer, factory.address, weth9.address);
  const nftDescriptorLibrary = await deployNFTDescriptorLibrary(hre, deployer);
  const positionDescriptor = await deployPositionDescriptor(hre, deployer, nftDescriptorLibrary.address, weth9.address);
  await deployNonfungiblePositionManager(hre, deployer, factory.address, weth9.address, positionDescriptor.address);
}

/**
 * Deploy the WETH9 contract
 *
 * @param hre - Hardhat Runtime Environment
 * @param contractOwner - The owner wallet's signer
 * @returns The deployment result
 */
async function deployWETH9(hre: HardhatRuntimeEnvironment, contractOwner: HardhatEthersSigner): Promise<DeployContractResult> {
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
async function deployFactory(hre: HardhatRuntimeEnvironment, contractOwner: HardhatEthersSigner): Promise<DeployContractResult> {
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
