import { expect } from "chai";
import { AddressLike, BigNumberish, ZeroAddress } from "ethers";
import hre, { ethers, getNamedAccounts } from "hardhat";

import {
  AmoManager,
  CurveStableSwapNGAmoVault,
  IERC20,
  OracleAggregator,
} from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { deployContract } from "../../utils/deploy";
import {
  AMO_MANAGER_ID,
  CURVE_STABLESWAPNG_AMO_VAULT_ID,
} from "../../utils/deploy-ids";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";
import { CURVE_CONTRACTS, POOLS, TOKENS, WHALES } from "../curve/registry";
import { standaloneMinimalFixture } from "./fixtures";

describe("CurveStableSwapNGAmoVault", () => {
  let curveAmoVault: CurveStableSwapNGAmoVault;
  let USDeContract: IERC20;
  let USDCContract: IERC20;
  let DAIContract: IERC20;
  let amoManager: AmoManager;
  let oracleAddress: string;
  let oracleAggregator: OracleAggregator;
  let dusdDeployer: string;
  let testAccount1: string;
  let dusdCollateralWithdrawer: string;
  let dusdRecoverer: string;
  let dusdAmoTrader: string;

  before(async function () {
    // Skip tests if not on local_ethereum network
    if (hre.network.name !== "local_ethereum") {
      console.log("This test is only run on local_ethereum network");
      this.skip();
    }
  });

  beforeEach(async function () {
    this.timeout(120000); // First deployment on local_ethereum takes a long time
    await standaloneMinimalFixture();

    // Fetch dependencies
    ({
      dusdDeployer,
      testAccount1,
      dusdCollateralWithdrawer,
      dusdRecoverer,
      dusdAmoTrader,
    } = await getNamedAccounts());
    const { address: amoManagerAddress } =
      await hre.deployments.get(AMO_MANAGER_ID);
    amoManager = await hre.ethers.getContractAt(
      "AmoManager",
      amoManagerAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
    const { address: oracleAggregatorAddress } =
      await hre.deployments.get(ORACLE_AGGREGATOR_ID);
    oracleAggregator = await hre.ethers.getContractAt(
      "OracleAggregator",
      oracleAggregatorAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
    oracleAddress = oracleAggregatorAddress;

    // Fetch the already deployed CurveStableSwapNGAmoVault
    const { address: curveAmoVaultAddress } = await hre.deployments.get(
      CURVE_STABLESWAPNG_AMO_VAULT_ID,
    );
    curveAmoVault = await hre.ethers.getContractAt(
      "CurveStableSwapNGAmoVault",
      curveAmoVaultAddress,
    );

    USDeContract = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      TOKENS.USDe.address,
    )) as unknown as IERC20;
    USDCContract = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      TOKENS.USDC.address,
    )) as unknown as IERC20;
    DAIContract = (await ethers.getContractAt(
      "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
      TOKENS.DAI.address,
    )) as unknown as IERC20;

    // Set oracle prices for USDe, USDC, DAI, and USDT
    const { address: mockOracleAggregatorAddress } = await deployContract(
      hre,
      "MockOracleAggregator",
      [ZeroAddress, BigInt(10) ** BigInt(AAVE_ORACLE_USD_DECIMALS)],
      undefined,
      await hre.ethers.getSigner(dusdDeployer),
      undefined,
      "MockOracleAggregator",
    );
    const mockOracleAggregatorContract = await hre.ethers.getContractAt(
      "MockOracleAggregator",
      mockOracleAggregatorAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    await mockOracleAggregatorContract.setAssetPrice(
      TOKENS.USDe.address,
      hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
    );
    await mockOracleAggregatorContract.setAssetPrice(
      TOKENS.USDC.address,
      hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
    );
    await mockOracleAggregatorContract.setAssetPrice(
      TOKENS.DAI.address,
      hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
    );
    await mockOracleAggregatorContract.setAssetPrice(
      TOKENS.USDT.address,
      hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
    );

    // Point OracleAggregator to the mock oracle
    await oracleAggregator.grantRole(
      await oracleAggregator.ORACLE_MANAGER_ROLE(),
      dusdDeployer,
    );
    await oracleAggregator.setOracle(
      TOKENS.USDe.address,
      mockOracleAggregatorAddress,
    );
    await oracleAggregator.setOracle(
      TOKENS.USDC.address,
      mockOracleAggregatorAddress,
    );
    await oracleAggregator.setOracle(
      TOKENS.DAI.address,
      mockOracleAggregatorAddress,
    );
    await oracleAggregator.setOracle(
      TOKENS.USDT.address,
      mockOracleAggregatorAddress,
    );
  });

  describe("Constructor", () => {
    it("should set the correct initial values", async () => {
      expect(await curveAmoVault.amoManager()).to.equal(
        await amoManager.getAddress(),
      );
      expect(await curveAmoVault.oracle()).to.equal(oracleAddress);
      expect(await curveAmoVault.router()).to.equal(CURVE_CONTRACTS.router);

      // Check roles
      expect(
        await curveAmoVault.hasRole(
          await curveAmoVault.DEFAULT_ADMIN_ROLE(),
          dusdDeployer,
        ),
      ).to.be.true;
      expect(
        await curveAmoVault.hasRole(
          await curveAmoVault.COLLATERAL_WITHDRAWER_ROLE(),
          dusdCollateralWithdrawer,
        ),
      ).to.be.true;
      expect(
        await curveAmoVault.hasRole(
          await curveAmoVault.RECOVERER_ROLE(),
          dusdRecoverer,
        ),
      ).to.be.true;
      expect(
        await curveAmoVault.hasRole(
          await curveAmoVault.AMO_TRADER_ROLE(),
          dusdAmoTrader,
        ),
      ).to.be.true;
    });
  });

  describe("Liquidity Management", () => {
    it("should add liquidity to the Curve pool", async function () {
      // Define amounts to deposit
      const USDeAmount = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const USDCAmount = ethers.parseUnits("100", TOKENS.USDC.decimals);
      const amounts = [USDeAmount, USDCAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([
        TOKENS.USDC.address,
        TOKENS.USDe.address,
      ]);

      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer tokens from whale to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );
      await USDCContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount,
      );

      // Get the pool address
      const poolAddress = POOLS.stableswapng.USDe_USDC.address;

      // The LP token is the same as the pool address
      const lpToken = await ethers.getContractAt(
        "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
        poolAddress,
      );

      // Snapshot the starting LP token balance
      const lpBalanceBefore = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );

      // Add liquidity to the pool using the dusdAmoTrader
      const minLPTokens = 0; // For simplicity, we're not calculating the minimum LP tokens here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress, amounts, minLPTokens);

      // Check the LP token balance after adding liquidity
      const lpBalanceAfter = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );
      expect(lpBalanceAfter).to.be.gt(lpBalanceBefore);

      // Check that the tokens were transferred from the CurveAmoVault
      const USDeBalanceAfter = await USDeContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      const USDCBalanceAfter = await USDCContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      expect(USDeBalanceAfter).to.equal(0);
      expect(USDCBalanceAfter).to.equal(0);

      // Check that the LP token is now tracked by the vault
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.true;
    });

    it("should add and remove liquidity from the Curve pool", async function () {
      // Define amounts to deposit
      const depositAmount100String = "100";
      const USDeAmount = ethers.parseUnits(
        depositAmount100String,
        TOKENS.USDe.decimals,
      );
      const USDCAmount = ethers.parseUnits(
        depositAmount100String,
        TOKENS.USDC.decimals,
      );
      const amounts = [USDeAmount, USDCAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([
        TOKENS.USDC.address,
        TOKENS.USDe.address,
      ]);

      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer tokens from whale to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );
      await USDCContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount,
      );

      // Get the pool address
      const poolAddress = POOLS.stableswapng.USDe_USDC.address;

      // The LP token is the same as the pool address
      const lpToken = await ethers.getContractAt(
        "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
        poolAddress,
      );

      // Add liquidity to the pool using the dusdAmoTrader
      const minLPTokens = 0; // For simplicity, we're not calculating the minimum LP tokens here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress, amounts, minLPTokens);

      // Check that the LP token is tracked by the vault
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.true;

      // Get the LP token balance
      const lpBalance = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );

      // Remove liquidity from the pool
      const minAmounts = [0, 0]; // For simplicity, we're not calculating the minimum amounts here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .removeLiquidity(poolAddress, lpBalance, minAmounts);

      // Check that the LP token balance is now zero
      const lpBalanceAfter = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );
      expect(lpBalanceAfter).to.equal(0);

      // Check that the LP token is no longer tracked by the vault
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.false;

      // Check that the tokens were transferred back to the CurveAmoVault
      const USDeBalanceAfter = await USDeContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      const USDCBalanceAfter = await USDCContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      // We expect the sum of the balances to be close to the original amounts, accounting for decimals
      const USDeBalanceAfterDecimal = Number(
        ethers.formatUnits(USDeBalanceAfter, TOKENS.USDe.decimals),
      );
      const USDCBalanceAfterDecimal = Number(
        ethers.formatUnits(USDCBalanceAfter, TOKENS.USDC.decimals),
      );
      // There may be some slippage so we check that it's close to the original amounts
      expect(USDeBalanceAfterDecimal + USDCBalanceAfterDecimal).to.be.closeTo(
        Number(depositAmount100String) * 2,
        1, // Allow for difference up to 1
      );
    });

    it("should remove liquidity from the Curve pool in one coin", async function () {
      // Define amounts to deposit
      const USDeAmount = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const USDCAmount = ethers.parseUnits("100", TOKENS.USDC.decimals);
      const amounts = [USDeAmount, USDCAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([
        TOKENS.USDC.address,
        TOKENS.USDe.address,
      ]);
      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer tokens from whale to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );
      await USDCContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount,
      );

      // Get the pool address
      const poolAddress = POOLS.stableswapng.USDe_USDC.address;

      // The LP token is the same as the pool address
      const lpToken = await ethers.getContractAt(
        "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
        poolAddress,
      );

      // Add liquidity to the pool using the dusdAmoTrader
      const minLPTokens = 0; // For simplicity, we're not calculating the minimum LP tokens here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress, amounts, minLPTokens);

      // Get the LP token balance
      const lpBalance = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );

      // Remove liquidity in one coin (USDe, index 0)
      const coinIndex = 0;
      const minAmount = 0; // For simplicity, we're not calculating the minimum amount here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .removeLiquidityOneCoin(poolAddress, lpBalance, coinIndex, minAmount);

      // Check that the LP token balance is now zero
      const lpBalanceAfter = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );
      expect(lpBalanceAfter).to.equal(0);

      // Check that the LP token is no longer tracked by the vault
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.false;

      // Check that we received USDe tokens
      const USDeBalanceAfter = await USDeContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      expect(USDeBalanceAfter).to.be.gt(USDeAmount);

      // Check that we didn't receive any USDC tokens
      const USDCBalanceAfter = await USDCContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      expect(USDCBalanceAfter).to.equal(0);
    });

    it("should remove liquidity imbalanced from the Curve pool", async function () {
      // Define amounts to deposit
      const USDeAmount = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const USDCAmount = ethers.parseUnits("100", TOKENS.USDC.decimals);
      const amounts = [USDeAmount, USDCAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([
        TOKENS.USDC.address,
        TOKENS.USDe.address,
      ]);

      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer tokens from whale to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );
      await USDCContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount,
      );

      // Get the pool address
      const poolAddress = POOLS.stableswapng.USDe_USDC.address;

      // The LP token is the same as the pool address
      const lpToken = await ethers.getContractAt(
        "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
        poolAddress,
      );

      // Add liquidity to the pool using the dusdAmoTrader
      const minLPTokens = 0; // For simplicity, we're not calculating the minimum LP tokens here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress, amounts, minLPTokens);

      // Get the LP token balance
      const lpBalance = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );

      // Remove liquidity imbalanced (more USDe than USDC)
      const withdrawAmounts = [
        ethers.parseUnits("80", TOKENS.USDe.decimals),
        ethers.parseUnits("20", TOKENS.USDC.decimals),
      ];
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .removeLiquidityImbalance(poolAddress, withdrawAmounts, lpBalance);

      // Check that the LP token balance has decreased but is not zero
      const lpBalanceAfter = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );
      expect(lpBalanceAfter).to.be.lt(lpBalance);
      expect(lpBalanceAfter).to.be.gt(0);

      // Check that the LP token is still tracked by the vault
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.true;

      // Check that we received the correct amounts of tokens
      const USDeBalanceAfter = await USDeContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      const USDCBalanceAfter = await USDCContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      expect(USDeBalanceAfter).to.be.closeTo(
        ethers.parseUnits("80", TOKENS.USDe.decimals),
        ethers.parseUnits("1", TOKENS.USDe.decimals), // Allow for some slippage
      );
      expect(USDCBalanceAfter).to.be.closeTo(
        ethers.parseUnits("20", TOKENS.USDC.decimals),
        ethers.parseUnits("1", TOKENS.USDC.decimals), // Allow for some slippage
      );
    });
  });

  describe("Swapping", () => {
    it("should perform a swap using the AMO Vault", async function () {
      // Define swap parameters
      const amountIn = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const route = [
        TOKENS.USDe.address,
        POOLS.stableswapng.USDe_USDC.address,
        TOKENS.USDC.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
      ];
      const swapParams: [
        [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
        [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
        [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
        [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
        [BigNumberish, BigNumberish, BigNumberish, BigNumberish, BigNumberish],
      ] = [
        [0, 1, 1, 1, 2],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ];
      const pools: [
        AddressLike,
        AddressLike,
        AddressLike,
        AddressLike,
        AddressLike,
      ] = [
        POOLS.stableswapng.USDe_USDC.address,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
      ];

      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer USDe from whale to AMO Vault
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        amountIn,
      );

      // Get expected output
      const expectedOutput = await curveAmoVault.getExpectedOutput(
        route,
        swapParams,
        amountIn,
        pools,
      );
      const minAmountOut = (expectedOutput * 99n) / 100n; // 99% of expected output, 1% max slippage

      // Snapshot balances before swap
      const USDeBalanceBefore = await USDeContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      const USDCBalanceBefore = await USDCContract.balanceOf(
        await curveAmoVault.getAddress(),
      );

      // Perform the swap
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .swapExactIn(route, swapParams, amountIn, minAmountOut, pools);

      // Check balances after swap
      const USDeBalanceAfter = await USDeContract.balanceOf(
        await curveAmoVault.getAddress(),
      );
      const USDCBalanceAfter = await USDCContract.balanceOf(
        await curveAmoVault.getAddress(),
      );

      // Verify the swap was successful
      expect(USDeBalanceAfter).to.equal(USDeBalanceBefore - amountIn);
      expect(USDCBalanceAfter).to.be.gte(USDCBalanceBefore + minAmountOut);
      // Add a buffer since we may receive more tokens than expected
      expect(USDCBalanceAfter).to.be.lte(
        ((USDCBalanceBefore + expectedOutput) * BigInt(101)) / BigInt(100),
      );
    });
  });

  describe("Collateral Management", () => {
    it("should allow new collateral tokens", async () => {
      const newCollateral1 = TOKENS.DAI.address;
      const newCollateral2 = TOKENS.USDT.address;

      // Check initial state
      expect(await curveAmoVault.isCollateralSupported(newCollateral1)).to.be
        .false;
      expect(await curveAmoVault.isCollateralSupported(newCollateral2)).to.be
        .false;

      // Allow new collateral tokens
      await curveAmoVault
        .connect(await ethers.getSigner(dusdDeployer))
        .allowCollaterals([newCollateral1, newCollateral2]);

      // Check updated state
      expect(await curveAmoVault.isCollateralSupported(newCollateral1)).to.be
        .true;
      expect(await curveAmoVault.isCollateralSupported(newCollateral2)).to.be
        .true;

      // Check listAllCollateral
      const allCollateral = await curveAmoVault.listCollateral();
      expect(allCollateral).to.include(newCollateral1);
      expect(allCollateral).to.include(newCollateral2);
    });

    it("should disallow collateral tokens", async () => {
      const collateralToRemove = TOKENS.USDC.address;

      // Allow collateral first
      await curveAmoVault
        .connect(await ethers.getSigner(dusdDeployer))
        .allowCollaterals([collateralToRemove]);
      expect(await curveAmoVault.isCollateralSupported(collateralToRemove)).to
        .be.true;

      // Disallow collateral
      await curveAmoVault
        .connect(await ethers.getSigner(dusdDeployer))
        .disallowCollaterals([collateralToRemove]);

      // Check updated state
      expect(await curveAmoVault.isCollateralSupported(collateralToRemove)).to
        .be.false;

      // Check listAllCollateral
      const allCollateral = await curveAmoVault.listCollateral();
      expect(allCollateral).to.not.include(collateralToRemove);
    });

    it("should correctly report allowed collateral", async () => {
      const allowedCollateral = TOKENS.USDe.address;
      const notAllowedCollateral = TOKENS.USDT.address;

      // Allow one collateral
      await curveAmoVault
        .connect(await ethers.getSigner(dusdDeployer))
        .allowCollaterals([allowedCollateral]);

      // Check isCollateralAllowed
      expect(await curveAmoVault.isCollateralSupported(allowedCollateral)).to.be
        .true;
      expect(await curveAmoVault.isCollateralSupported(notAllowedCollateral)).to
        .be.false;
    });

    it("should list all collateral tokens", async () => {
      const initialCollateral = await curveAmoVault.listCollateral();
      const newCollateral1 = TOKENS.DAI.address;
      const newCollateral2 = TOKENS.USDT.address;

      // Add new collateral
      await curveAmoVault
        .connect(await ethers.getSigner(dusdDeployer))
        .allowCollaterals([newCollateral1, newCollateral2]);

      // Check updated list
      const updatedCollateral = await curveAmoVault.listCollateral();
      expect(updatedCollateral.length).to.equal(initialCollateral.length + 2);
      expect(updatedCollateral).to.include(newCollateral1);
      expect(updatedCollateral).to.include(newCollateral2);
    });

    it("should not allow non-admin to manage collateral", async () => {
      const newCollateral = TOKENS.DAI.address;

      // Try to allow collateral as non-admin
      await expect(
        curveAmoVault
          .connect(await ethers.getSigner(testAccount1))
          .allowCollaterals([newCollateral]),
      ).to.be.revertedWithCustomError(
        curveAmoVault,
        "AccessControlUnauthorizedAccount",
      );
    });
  });

  describe("LP Token Management", () => {
    it("should correctly track LP tokens", async function () {
      // Define amounts to deposit
      const USDeAmount = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const USDCAmount = ethers.parseUnits("100", TOKENS.USDC.decimals);
      const amounts = [USDeAmount, USDCAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([
        TOKENS.USDC.address,
        TOKENS.USDe.address,
      ]);

      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer tokens from whale to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );
      await USDCContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount,
      );

      // Get the pool address
      const poolAddress = POOLS.stableswapng.USDe_USDC.address;

      // Check initial state
      expect(await curveAmoVault.getLpTokenCount()).to.equal(0);
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.false;
      expect(await curveAmoVault.getAllLpTokens()).to.be.empty;

      // Add liquidity to the pool
      const minLPTokens = 0; // For simplicity, we're not calculating the minimum LP tokens here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress, amounts, minLPTokens);

      // Check updated state
      expect(await curveAmoVault.getLpTokenCount()).to.equal(1);
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.true;
      const allLpTokens = await curveAmoVault.getAllLpTokens();
      expect(allLpTokens).to.have.lengthOf(1);
      expect(allLpTokens[0]).to.equal(poolAddress);

      // Add liquidity to another pool
      const anotherPoolAddress = POOLS.stableswapng.USDe_DAI.address;
      const DAIAmount = ethers.parseUnits("100", TOKENS.DAI.decimals);
      const anotherAmounts = [USDeAmount, DAIAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([TOKENS.DAI.address]);

      // Transfer more USDe to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );

      // Transfer DAI from a whale account with DAI to the CurveAmoVault contract
      const whale2 = await ethers.getImpersonatedSigner(
        WHALES.binance_pegtokenscollateral,
      );
      const DAI = (await ethers.getContractAt(
        "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
        TOKENS.DAI.address,
      )) as unknown as IERC20;
      await DAI.connect(whale2).transfer(
        await curveAmoVault.getAddress(),
        DAIAmount,
      );

      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(anotherPoolAddress, anotherAmounts, minLPTokens);

      // Check updated state after adding second LP token
      expect(await curveAmoVault.getLpTokenCount()).to.equal(2);
      expect(await curveAmoVault.hasLpToken(anotherPoolAddress)).to.be.true;
      const updatedAllLpTokens = await curveAmoVault.getAllLpTokens();
      expect(updatedAllLpTokens).to.have.lengthOf(2);
      expect(updatedAllLpTokens).to.include(poolAddress);
      expect(updatedAllLpTokens).to.include(anotherPoolAddress);
    });

    it("should remove LP tokens when liquidity is fully removed", async function () {
      // Define amounts to deposit
      const USDeAmount = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const USDCAmount = ethers.parseUnits("100", TOKENS.USDC.decimals);
      const amounts = [USDeAmount, USDCAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([
        TOKENS.USDC.address,
        TOKENS.USDe.address,
      ]);

      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer tokens from whale to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );
      await USDCContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount,
      );

      // Get the pool address
      const poolAddress = POOLS.stableswapng.USDe_USDC.address;

      // Add liquidity to the pool
      const minLPTokens = 0; // For simplicity, we're not calculating the minimum LP tokens here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress, amounts, minLPTokens);

      // Check state after adding liquidity
      expect(await curveAmoVault.getLpTokenCount()).to.equal(1);
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.true;

      // Get the LP token balance
      const lpToken = await ethers.getContractAt(
        "@openzeppelin/contracts-5/token/ERC20/IERC20.sol:IERC20",
        poolAddress,
      );
      const lpBalance = await lpToken.balanceOf(
        await curveAmoVault.getAddress(),
      );

      // Remove all liquidity from the pool
      const minAmounts = [0, 0]; // For simplicity, we're not calculating the minimum amounts here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .removeLiquidity(poolAddress, lpBalance, minAmounts);

      // Check state after removing all liquidity
      expect(await curveAmoVault.getLpTokenCount()).to.equal(0);
      expect(await curveAmoVault.hasLpToken(poolAddress)).to.be.false;
      expect(await curveAmoVault.getAllLpTokens()).to.be.empty;
    });
  });

  describe("Value Calculation", () => {
    it("should correctly calculate total collateral value with only collateral tokens", async function () {
      // Define amounts to deposit
      const USDeAmount = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const USDCAmount = ethers.parseUnits("100", TOKENS.USDC.decimals);

      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer tokens from whale to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );
      await USDCContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount,
      );

      // Allow USDC as collateral
      await curveAmoVault
        .connect(await ethers.getSigner(dusdDeployer))
        .allowCollaterals([TOKENS.USDC.address]);

      // Calculate expected value
      const USDePrice = await oracleAggregator.getAssetPrice(
        TOKENS.USDe.address,
      );
      const USDCPrice = await oracleAggregator.getAssetPrice(
        TOKENS.USDC.address,
      );
      const expectedValue =
        (USDeAmount * BigInt(USDePrice)) / BigInt(10 ** TOKENS.USDe.decimals) +
        (USDCAmount * BigInt(USDCPrice)) / BigInt(10 ** TOKENS.USDC.decimals);

      // Get total collateral value
      const totalValue = await curveAmoVault.totalCollateralValue();

      // Check if the calculated value matches the expected value
      expect(totalValue).to.be.closeTo(
        expectedValue,
        ethers.parseUnits("1", 18),
      ); // Allow for small rounding differences
    });

    it("should correctly calculate total collateral value with LP tokens", async function () {
      // Define amounts to deposit
      const USDeAmount = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const USDCAmount = ethers.parseUnits("100", TOKENS.USDC.decimals);
      const amounts = [USDeAmount, USDCAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([
        TOKENS.USDC.address,
        TOKENS.USDe.address,
      ]);

      // Impersonate a whale account to get some tokens
      const whale = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);

      // Transfer tokens from whale to the CurveAmoVault contract
      await USDeContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount,
      );
      await USDCContract.connect(whale).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount,
      );

      // Get the pool address
      const poolAddress = POOLS.stableswapng.USDe_USDC.address;

      // Add liquidity to the pool
      const minLPTokens = 0; // For simplicity, we're not calculating the minimum LP tokens here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress, amounts, minLPTokens);

      // Calculate expected value (only USDC value since USDe is excluded)
      const USDCPrice = await oracleAggregator.getAssetPrice(
        TOKENS.USDC.address,
      );
      const USDePrice = await oracleAggregator.getAssetPrice(
        TOKENS.USDe.address,
      );
      const expectedValue =
        (USDCAmount * BigInt(USDCPrice)) / BigInt(10 ** TOKENS.USDC.decimals) +
        (USDeAmount * BigInt(USDePrice)) / BigInt(10 ** TOKENS.USDe.decimals);

      // Get total collateral value
      const totalValue = await curveAmoVault.totalCollateralValue();

      // Check if the calculated value matches the expected value
      expect(totalValue).to.be.closeTo(
        expectedValue,
        ethers.parseUnits("1", 8), // Allow for small rounding differences, price oracle has 8 decimals
      );
    });

    it("should correctly calculate total collateral value with multiple LP tokens and collateral", async function () {
      // Define amounts to deposit for USDe/USDC pool
      const USDeAmount1 = ethers.parseUnits("100", TOKENS.USDe.decimals);
      const USDCAmount1 = ethers.parseUnits("100", TOKENS.USDC.decimals);
      const amounts1 = [USDeAmount1, USDCAmount1];

      // Define amounts to deposit for USDe/DAI pool
      const USDeAmount2 = ethers.parseUnits("150", TOKENS.USDe.decimals);
      const DAIAmount = ethers.parseUnits("150", TOKENS.DAI.decimals);
      const amounts2 = [USDeAmount2, DAIAmount];

      // Allow tokens as collateral
      await curveAmoVault.allowCollaterals([
        TOKENS.USDC.address,
        TOKENS.USDe.address,
        TOKENS.DAI.address,
      ]);

      // Impersonate whale accounts to get tokens
      const whale1 = await ethers.getImpersonatedSigner(WHALES.bybit_hotwallet);
      const whale2 = await ethers.getImpersonatedSigner(
        WHALES.binance_pegtokenscollateral,
      );

      // Transfer tokens from whales to the CurveAmoVault contract
      await USDeContract.connect(whale1).transfer(
        await curveAmoVault.getAddress(),
        USDeAmount1 + USDeAmount2,
      );
      await USDCContract.connect(whale1).transfer(
        await curveAmoVault.getAddress(),
        USDCAmount1,
      );
      await DAIContract.connect(whale2).transfer(
        // Use DAIContract here
        await curveAmoVault.getAddress(),
        DAIAmount,
      );

      // Get the pool addresses
      const poolAddress1 = POOLS.stableswapng.USDe_USDC.address;
      const poolAddress2 = POOLS.stableswapng.USDe_DAI.address;

      // Add liquidity to both pools
      const minLPTokens = 0; // For simplicity, we're not calculating the minimum LP tokens here
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress1, amounts1, minLPTokens);
      await curveAmoVault
        .connect(await ethers.getSigner(dusdAmoTrader))
        .addLiquidity(poolAddress2, amounts2, minLPTokens);

      // Calculate expected value (USDC and DAI values, excluding USDe)
      const USDCPrice = await oracleAggregator.getAssetPrice(
        TOKENS.USDC.address,
      );
      const USDePrice = await oracleAggregator.getAssetPrice(
        TOKENS.USDe.address,
      );
      const DAIPrice = await oracleAggregator.getAssetPrice(TOKENS.DAI.address);
      const expectedValue =
        (USDCAmount1 * BigInt(USDCPrice)) / BigInt(10 ** TOKENS.USDC.decimals) +
        (USDeAmount1 * BigInt(USDePrice)) / BigInt(10 ** TOKENS.USDe.decimals) +
        (USDeAmount2 * BigInt(USDePrice)) / BigInt(10 ** TOKENS.USDe.decimals) +
        (DAIAmount * BigInt(DAIPrice)) / BigInt(10 ** TOKENS.DAI.decimals);

      // Get total collateral value
      const totalValue = await curveAmoVault.totalCollateralValue();

      // Check if the calculated value matches the expected value
      expect(totalValue).to.be.closeTo(
        expectedValue,
        ethers.parseUnits("1", 8),
      ); // Allow for small rounding differences
    });

    it("should return zero when there are no collateral tokens or LP tokens", async function () {
      // Ensure no collateral tokens are allowed except DUSD (which is excluded from calculation)
      const allCollateral = await curveAmoVault.listCollateral();

      for (const collateral of allCollateral) {
        if (collateral !== (await curveAmoVault.dusd())) {
          await curveAmoVault
            .connect(await ethers.getSigner(dusdDeployer))
            .disallowCollaterals([collateral]);
        }
      }

      // Ensure no LP tokens are present
      const allLpTokens = await curveAmoVault.getAllLpTokens();
      expect(allLpTokens.length).to.equal(0);

      // Get total collateral value
      const totalValue = await curveAmoVault.totalCollateralValue();

      // Check if the calculated value is zero
      expect(totalValue).to.equal(0);
    });
  });
});
