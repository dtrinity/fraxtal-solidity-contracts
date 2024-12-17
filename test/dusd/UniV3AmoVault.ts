import { FeeAmount, TICK_SPACINGS } from "@uniswap/v3-sdk";
import { expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";

import deployUniswapV3AmoVault from "../../scripts/dusd/amo_vault/uniswapV3_amo_vault";
import {
  AmoManager,
  MintableERC20,
  MockStaticOracleWrapper,
  UniV3AmoVault,
} from "../../typechain-types";
import {
  AMO_MANAGER_ID,
  ISSUER_CONTRACT_ID,
  UNIV3_AMO_VAULT_ID,
} from "../../utils/deploy-ids";
import {
  NONFUNGIBLE_POSITION_MANAGER_ID,
  SWAP_ROUTER_ID,
} from "../../utils/dex/deploy-ids";
import { getDEXPoolAddressForPair } from "../../utils/dex/pool";
import { TokenInfo } from "../../utils/token";
import { getMaxTick, getMinTick } from "../ecosystem/utils.dex";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standardDUSDDEXFixture } from "./fixtures";

describe("UniV3AmoVault", () => {
  let uniV3AmoVault: UniV3AmoVault;
  let dusdContract: MintableERC20;
  let sfraxContract: MintableERC20;
  let amoManager: AmoManager;
  let oracleAddress: string;
  let mockOracle: MockStaticOracleWrapper;
  let positionManager: string;
  let dexPool: string;
  let swapRouter: string;
  let dusdDeployer: string;
  let testAccount1: string;
  let sfraxInfo: TokenInfo;
  let dusdInfo: TokenInfo;
  let testTokenDeployer: string;
  let dusdCollateralWithdrawer: string;
  let dusdRecoverer: string;
  let dusdAmoTrader: string;
  let token0: string;
  let token1: string;

  beforeEach(async () => {
    await standardDUSDDEXFixture();

    // Fetch dependencies
    ({
      dusdDeployer,
      testAccount1,
      testTokenDeployer,
      dusdCollateralWithdrawer,
      dusdRecoverer,
      dusdAmoTrader,
    } = await getNamedAccounts());
    const sfrax = await getTokenContractForSymbol(testTokenDeployer, "SFRAX");
    const dusd = await getTokenContractForSymbol(testTokenDeployer, "dUSD");
    sfraxInfo = sfrax.tokenInfo;
    sfraxContract = sfrax.contract;
    dusdInfo = dusd.tokenInfo;
    dusdContract = dusd.contract;
    const { address: swapRouterAddress } =
      await hre.deployments.get(SWAP_ROUTER_ID);
    swapRouter = swapRouterAddress as string;
    const { address: positionManagerAddress } = await hre.deployments.get(
      NONFUNGIBLE_POSITION_MANAGER_ID,
    );
    positionManager = positionManagerAddress as string;
    const { poolAddress: dexPoolAddress } = await getDEXPoolAddressForPair(
      sfraxInfo.address,
      dusdInfo.address,
    );
    dexPool = dexPoolAddress as string;
    const pool = await hre.ethers.getContractAt(
      "contracts/dex/core/interfaces/IUniswapV3Pool.sol:IUniswapV3Pool",
      dexPool,
    );
    token0 = await pool.token0();
    token1 = await pool.token1();
    const { address: amoManagerAddress } =
      await hre.deployments.get(AMO_MANAGER_ID);
    amoManager = await hre.ethers.getContractAt(
      "AmoManager",
      amoManagerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
    const { address: issuerAddress } =
      await hre.deployments.get(ISSUER_CONTRACT_ID);
    const issuer = await hre.ethers.getContractAt(
      "Issuer",
      issuerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
    // Use the issuer's oracle since currently dex oracle is set up with DUSD (not dUSD)
    oracleAddress = await issuer.oracle();
    mockOracle = await hre.ethers.getContractAt(
      "MockStaticOracleWrapper",
      oracleAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    // Deploy UniV3AmoVault
    const isDeployed = await deployUniswapV3AmoVault(
      hre,
      dusdInfo.address,
      amoManagerAddress,
      oracleAddress,
      dexPool,
      positionManager,
      swapRouter,
      dusdDeployer,
      dusdCollateralWithdrawer,
      dusdRecoverer,
      dusdAmoTrader,
    );

    if (!isDeployed) {
      throw new Error("Failed to deploy UniV3AmoVault");
    }

    const { address: uniV3AmoVaultAddress } =
      await hre.deployments.get(UNIV3_AMO_VAULT_ID);
    uniV3AmoVault = await hre.ethers.getContractAt(
      "UniV3AmoVault",
      uniV3AmoVaultAddress,
    );
    await amoManager.enableAmoVault(uniV3AmoVaultAddress);
  });

  describe("Constructor", () => {
    it("should set the correct initial values", async () => {
      expect(await uniV3AmoVault.dusd()).to.equal(dusdInfo.address);
      expect(await uniV3AmoVault.amoManager()).to.equal(
        await amoManager.getAddress(),
      );
      expect(await uniV3AmoVault.pool()).to.equal(dexPool);

      expect(await uniV3AmoVault.token0()).to.equal(token0);
      expect(await uniV3AmoVault.token1()).to.equal(token1);
      expect(await uniV3AmoVault.dusdIsToken0()).to.equal(
        token0 === dusdInfo.address,
      );
      expect(await uniV3AmoVault.collateralToken()).to.equal(
        token0 === dusdInfo.address ? token1 : token0,
      );
      expect(await uniV3AmoVault.positions()).to.equal(positionManager);
      expect(await uniV3AmoVault.router()).to.equal(swapRouter);
      expect(await uniV3AmoVault.oracle()).to.equal(oracleAddress);
    });

    it("should set the correct initial values for CollateralVault", async () => {
      expect(await uniV3AmoVault.oracle()).to.equal(oracleAddress);
      expect(await uniV3AmoVault.isCollateralSupported(sfraxInfo.address)).to.be
        .true;
    });
  });

  describe("Minting positions", () => {
    it("should mint a new position", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const baseCurrencyUnit = await mockOracle.BASE_CURRENCY_UNIT();
      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);
      const mintDUSDAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const collateralAmount = hre.ethers.parseUnits(
        (
          (mintDUSDAmount * baseCurrencyUnit) /
          sfraxPrice /
          BigInt(10 ** dusdInfo.decimals)
        ).toString(),
        sfraxInfo.decimals,
      );

      const params = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]), // covering all possible prices
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: (await uniV3AmoVault.dusdIsToken0())
          ? mintDUSDAmount
          : collateralAmount,
        amount1Desired: (await uniV3AmoVault.dusdIsToken0())
          ? collateralAmount
          : mintDUSDAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      // Allocate dUSD to the AMO vault
      // In reality, it should be issued by Issuer contract
      await dusdContract.mint(await amoManager.getAddress(), mintDUSDAmount);
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        collateralAmount,
      );
      await amoManager
        .connect(admin)
        .allocateAmo(await uniV3AmoVault.getAddress(), mintDUSDAmount);

      const tx = await uniV3AmoVault.connect(admin).mint(params);
      const receipt = await tx.wait();

      expect(receipt).to.not.be.null;
      expect(receipt?.status).to.equal(1);

      // Ensure a new position was actually created
      const positionsCount = await uniV3AmoVault.getPositionsCount();
      expect(positionsCount).to.equal(1);

      const position = await uniV3AmoVault.getPosition(0);
      expect(position.tokenId).to.be.gt(0);
      expect(position.liquidity).to.be.gt(0);

      // Ensure token balances after minting
      const dusdBalance = await dusdContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );
      const sfraxBalance = await sfraxContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );

      expect(dusdBalance).to.be.lt(
        hre.ethers.parseUnits("1", dusdInfo.decimals),
      ); // assume slippage is less than 1%
      expect(sfraxBalance).to.be.lt(
        hre.ethers.parseUnits("1", sfraxInfo.decimals),
      ); // assume slippage is less than 1%

      console.log("Residual dUSD balance:", dusdBalance.toString());
      console.log("Residual sFRAX balance:", sfraxBalance.toString());
    });

    it("should revert when minting with insufficient balance", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const baseCurrencyUnit = await mockOracle.BASE_CURRENCY_UNIT();
      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);

      const mintDUSDAmount = hre.ethers.parseUnits(
        "1000000",
        dusdInfo.decimals,
      ); // Very large amount
      const collateralAmount = hre.ethers.parseUnits(
        (
          (mintDUSDAmount * baseCurrencyUnit) /
          sfraxPrice /
          BigInt(10 ** dusdInfo.decimals)
        ).toString(),
        sfraxInfo.decimals,
      );

      const params = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: collateralAmount,
        amount1Desired: mintDUSDAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      // Don't allocate any dUSD to the AMO vault
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        collateralAmount,
      );

      await expect(
        uniV3AmoVault.connect(admin).mint(params),
      ).to.be.revertedWith("STF");
    });
  });

  describe("Burning positions", () => {
    it("should burn an existing position", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const baseCurrencyUnit = await mockOracle.BASE_CURRENCY_UNIT();
      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);

      const mintDUSDAmount = hre.ethers.parseUnits("1000", dusdInfo.decimals);
      const collateralAmount = hre.ethers.parseUnits(
        (
          (mintDUSDAmount * baseCurrencyUnit) /
          sfraxPrice /
          BigInt(10 ** dusdInfo.decimals)
        ).toString(),
        sfraxInfo.decimals,
      );

      const params = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: (await uniV3AmoVault.dusdIsToken0())
          ? mintDUSDAmount
          : collateralAmount,
        amount1Desired: (await uniV3AmoVault.dusdIsToken0())
          ? collateralAmount
          : mintDUSDAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      await dusdContract.mint(await amoManager.getAddress(), mintDUSDAmount);
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        collateralAmount,
      );
      await amoManager
        .connect(admin)
        .allocateAmo(await uniV3AmoVault.getAddress(), mintDUSDAmount);

      await uniV3AmoVault.connect(admin).mint(params);

      const position = await uniV3AmoVault.getPosition(0);
      const tokenId = position.tokenId;

      const burnTx = await uniV3AmoVault.connect(admin).burn(tokenId);
      const burnReceipt = await burnTx.wait();

      expect(burnReceipt).to.not.be.null;
      expect(burnReceipt?.status).to.equal(1);

      await expect(uniV3AmoVault.getPosition(0)).to.be.reverted;
    });

    it("should revert when burning a non-existent position", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const nonExistentTokenId = 999999;
      await expect(uniV3AmoVault.connect(admin).burn(nonExistentTokenId))
        .to.be.revertedWithCustomError(uniV3AmoVault, "PositionDoesNotExist")
        .withArgs(nonExistentTokenId);
    });
  });

  describe("Increasing liquidity", () => {
    it("should increase liquidity of an existing position", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const baseCurrencyUnit = await mockOracle.BASE_CURRENCY_UNIT();
      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);

      // Initial minting
      const initialMintDUSDAmount = hre.ethers.parseUnits(
        "1000",
        dusdInfo.decimals,
      );
      const initialCollateralAmount = hre.ethers.parseUnits(
        (
          (initialMintDUSDAmount * baseCurrencyUnit) /
          sfraxPrice /
          BigInt(10 ** dusdInfo.decimals)
        ).toString(),
        sfraxInfo.decimals,
      );

      const initialMintParams = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: (await uniV3AmoVault.dusdIsToken0())
          ? initialMintDUSDAmount
          : initialCollateralAmount,
        amount1Desired: (await uniV3AmoVault.dusdIsToken0())
          ? initialCollateralAmount
          : initialMintDUSDAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      // Allocate initial dUSD and sFRAX to the AMO vault
      await dusdContract.mint(
        await amoManager.getAddress(),
        initialMintDUSDAmount,
      );
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        initialCollateralAmount,
      );
      await amoManager
        .connect(admin)
        .allocateAmo(await uniV3AmoVault.getAddress(), initialMintDUSDAmount);

      // Perform initial minting
      await uniV3AmoVault.connect(admin).mint(initialMintParams);

      // Get the initial position
      const initialPosition = await uniV3AmoVault.getPosition(0);
      const tokenId = initialPosition.tokenId;
      const initialLiquidity = initialPosition.liquidity;
      console.log("initialLiquidity:", initialLiquidity.toString());

      // Prepare for increasing liquidity
      const increaseDUSDAmount = hre.ethers.parseUnits(
        "500",
        dusdInfo.decimals,
      );
      const increaseCollateralAmount = hre.ethers.parseUnits(
        (
          (increaseDUSDAmount * baseCurrencyUnit) /
          sfraxPrice /
          BigInt(10 ** dusdInfo.decimals)
        ).toString(),
        sfraxInfo.decimals,
      );

      const increaseLiquidityParams = {
        tokenId: tokenId,
        amount0Desired: (await uniV3AmoVault.dusdIsToken0())
          ? increaseDUSDAmount
          : increaseCollateralAmount,
        amount1Desired: (await uniV3AmoVault.dusdIsToken0())
          ? increaseCollateralAmount
          : increaseDUSDAmount,
        amount0Min: 0,
        amount1Min: 0,
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      // Allocate additional dUSD and sFRAX to the AMO vault
      await dusdContract.mint(
        await amoManager.getAddress(),
        increaseDUSDAmount,
      );
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        increaseCollateralAmount,
      );
      await amoManager
        .connect(admin)
        .allocateAmo(await uniV3AmoVault.getAddress(), increaseDUSDAmount);

      // Increase liquidity
      const increaseTx = await uniV3AmoVault
        .connect(admin)
        .increaseLiquidity(increaseLiquidityParams);
      const increaseReceipt = await increaseTx.wait();
      expect(increaseReceipt).to.not.be.null;
      expect(increaseReceipt?.status).to.equal(1);

      // Check the updated position
      const updatedPosition = await uniV3AmoVault.getPosition(0);
      expect(updatedPosition.liquidity).to.be.gt(initialLiquidity);

      // Check token balances after increasing liquidity
      expect(
        await dusdContract.balanceOf(await uniV3AmoVault.getAddress()),
      ).to.be.lt(hre.ethers.parseUnits("1", dusdInfo.decimals)); // dUSD balance of AMO vault should be very small (accounting for potential dust)
      expect(
        await sfraxContract.balanceOf(await uniV3AmoVault.getAddress()),
      ).to.be.lt(hre.ethers.parseUnits("1", sfraxInfo.decimals)); // sFRAX balance of AMO vault should be very small (accounting for potential dust)
    });
  });

  describe("Decreasing liquidity", () => {
    it("should decrease liquidity of an existing position", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const baseCurrencyUnit = await mockOracle.BASE_CURRENCY_UNIT();
      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);

      // Initial minting
      const initialMintDUSDAmount = hre.ethers.parseUnits(
        "1000",
        dusdInfo.decimals,
      );
      const initialCollateralAmount = hre.ethers.parseUnits(
        (
          (initialMintDUSDAmount * baseCurrencyUnit) /
          sfraxPrice /
          BigInt(10 ** dusdInfo.decimals)
        ).toString(),
        sfraxInfo.decimals,
      );

      const initialMintParams = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: initialCollateralAmount,
        amount1Desired: initialMintDUSDAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      // Allocate initial dUSD and sFRAX to the AMO vault
      await dusdContract.mint(
        await amoManager.getAddress(),
        initialMintDUSDAmount,
      );
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        initialCollateralAmount,
      );
      await amoManager
        .connect(admin)
        .allocateAmo(await uniV3AmoVault.getAddress(), initialMintDUSDAmount);

      // Perform initial minting
      await uniV3AmoVault.connect(admin).mint(initialMintParams);

      // Get the initial position
      const initialPosition = await uniV3AmoVault.getPosition(0);
      const tokenId = initialPosition.tokenId;
      const initialLiquidity = initialPosition.liquidity;

      // Prepare for decreasing liquidity
      const decreasePercentage = 50; // Decrease liquidity by 50%
      const liquidityToRemove =
        (initialLiquidity * BigInt(decreasePercentage)) / BigInt(100);

      // Decrease liquidity
      const decreaseTx = await uniV3AmoVault
        .connect(admin)
        .decreaseLiquidity(tokenId, liquidityToRemove);
      const decreaseReceipt = await decreaseTx.wait();

      expect(decreaseReceipt).to.not.be.null;
      expect(decreaseReceipt?.status).to.equal(1);

      // Check the updated position
      const updatedPosition = await uniV3AmoVault.getPosition(0);
      expect(updatedPosition.liquidity).to.be.lt(initialLiquidity);
      expect(updatedPosition.liquidity).to.be.closeTo(
        initialLiquidity - liquidityToRemove,
        1,
      ); // Allow for small rounding differences
    });
  });

  describe("Swapping", () => {
    it("should perform exactOutputSingle swap", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const swapAmount = hre.ethers.parseUnits("100", dusdInfo.decimals);
      const maxInputAmount = hre.ethers.parseUnits("110", sfraxInfo.decimals);

      const swapParams = {
        tokenIn: sfraxInfo.address,
        tokenOut: dusdInfo.address,
        fee: FeeAmount.HIGH,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        amountOut: swapAmount,
        amountInMaximum: maxInputAmount,
        sqrtPriceLimitX96: 0,
      };

      // Mint some sFRAX to the AMO vault
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        maxInputAmount,
      );

      const initialSfraxBalance = await sfraxContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );
      const initialDusdBalance = await dusdContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );

      const swapTx = await uniV3AmoVault
        .connect(admin)
        .swapExactOutputSingle(swapParams);
      await swapTx.wait();

      const finalSfraxBalance = await sfraxContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );
      const finalDusdBalance = await dusdContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );

      expect(finalSfraxBalance).to.be.lt(initialSfraxBalance);
      expect(finalDusdBalance).to.equal(initialDusdBalance + swapAmount);
    });

    it("should perform exactInputSingle swap", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const swapAmount = hre.ethers.parseUnits("100", sfraxInfo.decimals);
      const minOutputAmount = hre.ethers.parseUnits("90", dusdInfo.decimals);

      const swapParams = {
        tokenIn: sfraxInfo.address,
        tokenOut: dusdInfo.address,
        fee: FeeAmount.HIGH,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        amountIn: swapAmount,
        amountOutMinimum: minOutputAmount,
        sqrtPriceLimitX96: 0,
      };

      // Mint some sFRAX to the AMO vault
      await sfraxContract.mint(await uniV3AmoVault.getAddress(), swapAmount);

      const initialSfraxBalance = await sfraxContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );
      const initialDusdBalance = await dusdContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );

      const swapTx = await uniV3AmoVault
        .connect(admin)
        .swapExactInputSingle(swapParams);
      await swapTx.wait();

      const finalSfraxBalance = await sfraxContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );
      const finalDusdBalance = await dusdContract.balanceOf(
        await uniV3AmoVault.getAddress(),
      );

      expect(finalSfraxBalance).to.equal(initialSfraxBalance - swapAmount);
      expect(finalDusdBalance).to.be.gt(initialDusdBalance);
      expect(finalDusdBalance).to.be.gte(initialDusdBalance + minOutputAmount);
    });

    it("should revert exactOutputSingle swap if slippage is too high", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const swapAmount = hre.ethers.parseUnits("100", dusdInfo.decimals);
      const maxInputAmount = hre.ethers.parseUnits("79", sfraxInfo.decimals); // Set a very low max input

      const swapParams = {
        tokenIn: sfraxInfo.address,
        tokenOut: dusdInfo.address,
        fee: FeeAmount.HIGH,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        amountOut: swapAmount,
        amountInMaximum: maxInputAmount,
        sqrtPriceLimitX96: 0,
      };

      // Mint some sFRAX to the AMO vault
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        maxInputAmount,
      );

      await expect(
        uniV3AmoVault.connect(admin).swapExactOutputSingle(swapParams),
      ).to.be.revertedWith("STF");
    });

    it("should revert exactInputSingle swap if slippage is too high", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const swapAmount = hre.ethers.parseUnits("100", sfraxInfo.decimals);
      const minOutputAmount = hre.ethers.parseUnits("200", dusdInfo.decimals); // Set a very high min output

      const swapParams = {
        tokenIn: sfraxInfo.address,
        tokenOut: dusdInfo.address,
        fee: FeeAmount.HIGH,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        amountIn: swapAmount,
        amountOutMinimum: minOutputAmount,
        sqrtPriceLimitX96: 0,
      };

      // Mint some sFRAX to the AMO vault
      await sfraxContract.mint(await uniV3AmoVault.getAddress(), swapAmount);

      await expect(
        uniV3AmoVault.connect(admin).swapExactInputSingle(swapParams),
      ).to.be.revertedWith("Too little received");
    });
  });

  describe("Access control", () => {
    it("should only allow AMO trader to mint positions", async () => {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      const mintParams = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: hre.ethers.parseUnits("1000", sfraxInfo.decimals),
        amount1Desired: hre.ethers.parseUnits("1000", dusdInfo.decimals),
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      await expect(uniV3AmoVault.connect(normalUser).mint(mintParams))
        .to.be.revertedWithCustomError(
          uniV3AmoVault,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(
          await normalUser.getAddress(),
          await uniV3AmoVault.AMO_TRADER_ROLE(),
        );
    });

    it("should only allow AMO trader to burn positions", async () => {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      await expect(uniV3AmoVault.connect(normalUser).burn(1))
        .to.be.revertedWithCustomError(
          uniV3AmoVault,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(
          await normalUser.getAddress(),
          await uniV3AmoVault.AMO_TRADER_ROLE(),
        );
    });

    it("should only allow AMO trader to increase liquidity", async () => {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      const increaseLiquidityParams = {
        tokenId: 1,
        amount0Desired: hre.ethers.parseUnits("500", sfraxInfo.decimals),
        amount1Desired: hre.ethers.parseUnits("500", dusdInfo.decimals),
        amount0Min: 0,
        amount1Min: 0,
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      await expect(
        uniV3AmoVault
          .connect(normalUser)
          .increaseLiquidity(increaseLiquidityParams),
      )
        .to.be.revertedWithCustomError(
          uniV3AmoVault,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(
          await normalUser.getAddress(),
          await uniV3AmoVault.AMO_TRADER_ROLE(),
        );
    });

    it("should only allow AMO trader to decrease liquidity", async () => {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      const tokenId = 1;
      const liquidity = hre.ethers.parseUnits("100", 18);

      await expect(
        uniV3AmoVault.connect(normalUser).decreaseLiquidity(tokenId, liquidity),
      )
        .to.be.revertedWithCustomError(
          uniV3AmoVault,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(
          await normalUser.getAddress(),
          await uniV3AmoVault.AMO_TRADER_ROLE(),
        );
    });

    it("should revert swaps when called by non-AMO trader", async () => {
      const normalUser = await hre.ethers.getSigner(testAccount1);
      const swapAmount = hre.ethers.parseUnits("100", dusdInfo.decimals);
      const maxInputAmount = hre.ethers.parseUnits("110", sfraxInfo.decimals);

      const swapExactOutParams = {
        tokenIn: sfraxInfo.address,
        tokenOut: dusdInfo.address,
        fee: FeeAmount.HIGH,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        amountOut: swapAmount,
        amountInMaximum: maxInputAmount,
        sqrtPriceLimitX96: 0,
      };

      const swapExactInParams = {
        tokenIn: sfraxInfo.address,
        tokenOut: dusdInfo.address,
        fee: FeeAmount.HIGH,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        amountIn: swapAmount,
        amountOutMinimum: hre.ethers.parseUnits("90", dusdInfo.decimals),
        sqrtPriceLimitX96: 0,
      };

      await expect(
        uniV3AmoVault
          .connect(normalUser)
          .swapExactOutputSingle(swapExactOutParams),
      )
        .to.be.revertedWithCustomError(
          uniV3AmoVault,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(
          await normalUser.getAddress(),
          await uniV3AmoVault.AMO_TRADER_ROLE(),
        );

      await expect(
        uniV3AmoVault
          .connect(normalUser)
          .swapExactInputSingle(swapExactInParams),
      )
        .to.be.revertedWithCustomError(
          uniV3AmoVault,
          "AccessControlUnauthorizedAccount",
        )
        .withArgs(
          await normalUser.getAddress(),
          await uniV3AmoVault.AMO_TRADER_ROLE(),
        );
    });
  });

  describe("Edge cases", () => {
    it("should revert when trying to mint with zero amounts", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const params = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: 0,
        amount1Desired: 0,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      await expect(
        uniV3AmoVault.connect(admin).mint(params),
      ).to.be.revertedWith("Both amounts must be non-zero");
    });

    it("should revert when trying to increase liquidity with zero amounts", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const increaseLiquidityParams = {
        tokenId: 1,
        amount0Desired: 0,
        amount1Desired: 0,
        amount0Min: 0,
        amount1Min: 0,
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      await expect(
        uniV3AmoVault.connect(admin).increaseLiquidity(increaseLiquidityParams),
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should revert when trying to burn a non-existent position", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const nonExistentTokenId = 999999;

      await expect(uniV3AmoVault.connect(admin).burn(nonExistentTokenId))
        .to.be.revertedWithCustomError(uniV3AmoVault, "PositionDoesNotExist")
        .withArgs(nonExistentTokenId);
    });

    it("should handle extreme price ranges when minting", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const extremeParams = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: hre.ethers.parseUnits("1000000", sfraxInfo.decimals),
        amount1Desired: hre.ethers.parseUnits("1000000", dusdInfo.decimals),
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      // Allocate tokens to the AMO vault
      await dusdContract.mint(
        await amoManager.getAddress(),
        extremeParams.amount1Desired,
      );
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        extremeParams.amount0Desired,
      );
      await amoManager
        .connect(admin)
        .allocateAmo(
          await uniV3AmoVault.getAddress(),
          extremeParams.amount1Desired,
        );

      await expect(uniV3AmoVault.connect(admin).mint(extremeParams)).to.not.be
        .reverted;
    });

    it("should revert when trying to decrease liquidity more than available", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);

      // First, mint a position
      const mintParams = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: hre.ethers.parseUnits("1000", sfraxInfo.decimals),
        amount1Desired: hre.ethers.parseUnits("1000", dusdInfo.decimals),
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      // Allocate tokens to the AMO vault
      await dusdContract.mint(
        await amoManager.getAddress(),
        mintParams.amount1Desired,
      );
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        mintParams.amount0Desired,
      );
      await amoManager
        .connect(admin)
        .allocateAmo(
          await uniV3AmoVault.getAddress(),
          mintParams.amount1Desired,
        );

      await uniV3AmoVault.connect(admin).mint(mintParams);

      const position = await uniV3AmoVault.getPosition(0);
      const tokenId = position.tokenId;

      // Try to decrease more liquidity than available
      const tooMuchLiquidity = position.liquidity + BigInt(1);

      await expect(
        uniV3AmoVault
          .connect(admin)
          .decreaseLiquidity(tokenId, tooMuchLiquidity),
      ).to.be.reverted; // The exact error message might depend on the Uniswap V3 implementation
    });

    it("should handle swaps with minimum possible amounts", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const minAmount = 1; // Smallest possible amount

      const swapExactOutParams = {
        tokenIn: sfraxInfo.address,
        tokenOut: dusdInfo.address,
        fee: FeeAmount.HIGH,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
        amountOut: minAmount,
        amountInMaximum: hre.ethers.parseUnits("1", sfraxInfo.decimals), // Set a reasonable max input
        sqrtPriceLimitX96: 0,
      };

      // Mint some sFRAX to the AMO vault
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        hre.ethers.parseUnits("1", sfraxInfo.decimals),
      );

      await expect(
        uniV3AmoVault.connect(admin).swapExactOutputSingle(swapExactOutParams),
      ).to.not.be.reverted;
    });
  });

  describe("totalCollateralValue", () => {
    it("should return correct value with only collateral token balance", async () => {
      const collateralAmount = hre.ethers.parseUnits(
        "1000",
        sfraxInfo.decimals,
      );
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        collateralAmount,
      );

      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);
      const expectedValue =
        (collateralAmount * sfraxPrice) / BigInt(10 ** sfraxInfo.decimals);

      const totalValue = await uniV3AmoVault.totalCollateralValue();
      expect(totalValue).to.equal(expectedValue);
    });

    it("should return correct value with collateral token balance and positions", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const initialDUSDAmount = 1000n;
      const mintDUSDAmount = hre.ethers.parseUnits(
        initialDUSDAmount.toString(),
        dusdInfo.decimals,
      );

      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);
      const collateralAmount =
        (initialDUSDAmount * BigInt(10 ** sfraxInfo.decimals)) / sfraxPrice;

      // Mint collateral to the vault
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        2n * collateralAmount,
      );

      // Create a position
      const mintParams = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: collateralAmount,
        amount1Desired: mintDUSDAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      await dusdContract.mint(await amoManager.getAddress(), mintDUSDAmount);
      await amoManager
        .connect(admin)
        .allocateAmo(await uniV3AmoVault.getAddress(), mintDUSDAmount);

      await uniV3AmoVault.connect(admin).mint(mintParams);

      const expectedCollateralValue =
        (collateralAmount * sfraxPrice) / BigInt(10 ** sfraxInfo.decimals);

      // Calculate the expected position value (assuming equal distribution of tokens in the position)
      const expectedPositionValue =
        (collateralAmount * sfraxPrice) / BigInt(10 ** sfraxInfo.decimals);

      const totalValue = await uniV3AmoVault.totalCollateralValue();
      const expectedTotalValue =
        expectedCollateralValue + expectedPositionValue;

      expect(totalValue).to.be.closeTo(expectedTotalValue, expectedTotalValue);
    });

    it("should return correct value with multiple positions", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const initialDUSDAmount = 1000n;
      const mintDUSDAmount = hre.ethers.parseUnits(
        initialDUSDAmount.toString(),
        dusdInfo.decimals,
      );

      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);
      const collateralAmount =
        (initialDUSDAmount * BigInt(10 ** sfraxInfo.decimals)) / sfraxPrice;

      // Create two positions
      const mintParams = {
        token0: await uniV3AmoVault.token0(),
        token1: await uniV3AmoVault.token1(),
        fee: FeeAmount.HIGH,
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
        amount0Desired: collateralAmount,
        amount1Desired: mintDUSDAmount,
        amount0Min: 0,
        amount1Min: 0,
        recipient: await uniV3AmoVault.getAddress(),
        deadline: Math.floor(Date.now() / 1000) + 3600,
      };

      await dusdContract.mint(
        await amoManager.getAddress(),
        mintDUSDAmount * 2n,
      );
      await sfraxContract.mint(
        await uniV3AmoVault.getAddress(),
        collateralAmount * 2n,
      );
      await amoManager
        .connect(admin)
        .allocateAmo(await uniV3AmoVault.getAddress(), mintDUSDAmount * 2n);

      await uniV3AmoVault.connect(admin).mint(mintParams);
      await uniV3AmoVault.connect(admin).mint(mintParams);

      const expectedPositionValue =
        (collateralAmount * sfraxPrice) / BigInt(10 ** sfraxInfo.decimals);
      const expectedTotalValue = expectedPositionValue * 2n;

      const totalValue = await uniV3AmoVault.totalCollateralValue();

      expect(totalValue).to.be.closeTo(expectedTotalValue, expectedTotalValue);
    });

    it("should return zero when there are no positions or collateral", async () => {
      const totalValue = await uniV3AmoVault.totalCollateralValue();
      expect(totalValue).to.equal(0);
    });

    it("should include deposited collateral in totalCollateralValue", async () => {
      const { dusdDeployer } = await hre.getNamedAccounts();
      const admin = await hre.ethers.getSigner(dusdDeployer);
      const depositAmount = hre.ethers.parseUnits("100", sfraxInfo.decimals);

      // Mint some sFRAX to the admin and deposit
      await sfraxContract.mint(admin.address, depositAmount);
      await sfraxContract
        .connect(admin)
        .approve(await uniV3AmoVault.getAddress(), depositAmount);
      await uniV3AmoVault
        .connect(admin)
        .deposit(depositAmount, sfraxInfo.address);

      const sfraxPrice = await mockOracle.getAssetPrice(sfraxInfo.address);
      const expectedValue =
        (depositAmount * sfraxPrice) / BigInt(10 ** sfraxInfo.decimals);

      const totalValue = await uniV3AmoVault.totalCollateralValue();
      expect(totalValue).to.equal(expectedValue);
    });
  });
});
