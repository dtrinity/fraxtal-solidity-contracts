import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { parseEther, parseUnits } from "ethers";
import { ethers } from "hardhat";

import type { ERC4626BalanceChecker } from "../../typechain-types/contracts/fxtl_balance_checkers/implementations/ERC4626BalanceChecker";
import type { TestnetERC20 } from "../../typechain-types/contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20";
import type { MockERC4626Token } from "../../typechain-types/contracts/token/MockERC4626Token";
import { ERC4626BalanceChecker__factory as ERC4626BalanceCheckerFactory } from "../../typechain-types/factories/contracts/fxtl_balance_checkers/implementations/ERC4626BalanceChecker__factory";
import { TestnetERC20__factory as TestnetERC20Factory } from "../../typechain-types/factories/contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20__factory";
import { MockERC4626Token__factory as MockERC4626TokenFactory } from "../../typechain-types/factories/contracts/token/MockERC4626Token__factory";

describe("ERC4626BalanceChecker", () => {
  let balanceChecker: ERC4626BalanceChecker;
  let mockVaultToken: MockERC4626Token;
  let mockUnderlyingToken: TestnetERC20;
  let mockExternalToken: TestnetERC20;
  let _deployer: SignerWithAddress;
  let users: SignerWithAddress[];

  beforeEach(async () => {
    [_deployer, ...users] = await ethers.getSigners();

    // Deploy mock underlying token (simulating dUSD)
    const TestnetERC20 = (await ethers.getContractFactory(
      "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
    )) as TestnetERC20Factory;
    mockUnderlyingToken = await TestnetERC20.deploy(
      "Mock dUSD",
      "dUSD",
      6, // dUSD uses 6 decimals on Fraxtal
      _deployer.address,
    );

    // Deploy mock external token
    mockExternalToken = await TestnetERC20.deploy(
      "Mock External",
      "MEXT",
      18,
      _deployer.address,
    );

    // Deploy mock ERC4626 vault (simulating sdUSD)
    const MockERC4626Token = (await ethers.getContractFactory(
      "contracts/token/MockERC4626Token.sol:MockERC4626Token",
    )) as MockERC4626TokenFactory;
    mockVaultToken = await MockERC4626Token.deploy(
      await mockUnderlyingToken.getAddress(),
      "Mock Vault Token",
      "MVT",
    );

    // Deploy balance checker
    const ERC4626BalanceChecker = (await ethers.getContractFactory(
      "contracts/fxtl_balance_checkers/implementations/ERC4626BalanceChecker.sol:ERC4626BalanceChecker",
    )) as ERC4626BalanceCheckerFactory;
    balanceChecker = await ERC4626BalanceChecker.deploy(
      _deployer.address,
      await mockVaultToken.getAddress(),
    );

    // Map external token to vault token
    await balanceChecker.mapExternalSource(
      await mockExternalToken.getAddress(),
      await mockVaultToken.getAddress(),
    );

    // Disable protection on mock tokens to allow minting
    await (mockUnderlyingToken.connect(_deployer) as any).setProtected(false);
    await (mockExternalToken.connect(_deployer) as any).setProtected(false);
  });

  describe("constructor", () => {
    it("should set admin role correctly", async () => {
      const DEFAULT_ADMIN_ROLE = await balanceChecker.DEFAULT_ADMIN_ROLE();
      expect(
        await balanceChecker.hasRole(DEFAULT_ADMIN_ROLE, _deployer.address),
      ).to.be.true;
    });

    it("should set vault token correctly", async () => {
      const vaultToken = await balanceChecker.vaultToken();
      expect(vaultToken).to.equal(await mockVaultToken.getAddress());
    });

    it("should revert with zero admin address", async () => {
      const ERC4626BalanceChecker = (await ethers.getContractFactory(
        "contracts/fxtl_balance_checkers/implementations/ERC4626BalanceChecker.sol:ERC4626BalanceChecker",
      )) as ERC4626BalanceCheckerFactory;

      await expect(
        ERC4626BalanceChecker.deploy(
          ethers.ZeroAddress,
          await mockVaultToken.getAddress(),
        ),
      ).to.be.revertedWithCustomError(balanceChecker, "InvalidAddress");
    });

    it("should revert with zero vault token address", async () => {
      const ERC4626BalanceChecker = (await ethers.getContractFactory(
        "contracts/fxtl_balance_checkers/implementations/ERC4626BalanceChecker.sol:ERC4626BalanceChecker",
      )) as ERC4626BalanceCheckerFactory;

      await expect(
        ERC4626BalanceChecker.deploy(_deployer.address, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(balanceChecker, "InvalidAddress");
    });
  });

  describe("tokenBalances", () => {
    describe("when passing vault token directly", () => {
      it("should return correct balance with 1:1 share-to-asset ratio", async () => {
        const userShares = parseUnits("100", 6); // 100 shares with 6 decimals
        const totalShares = parseUnits("1000", 6);
        const totalAssets = parseUnits("1000", 6); // 1:1 ratio

        await mockVaultToken.setBalance(users[0].address, userShares);
        await mockVaultToken.setTotalSupply(totalShares);
        await mockVaultToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockVaultToken.getAddress(),
          [users[0].address],
        );

        // Expected: userShares converted to assets, then normalized to 18 decimals
        // 100 * 6 decimals -> 18 decimals = 100 * 10^12
        expect(balances[0]).to.equal(parseUnits("100", 18));
      });

      it("should return correct balance with 2:1 share-to-asset ratio", async () => {
        const userShares = parseUnits("100", 6); // 100 shares
        const totalShares = parseUnits("1000", 6);
        const totalAssets = parseUnits("2000", 6); // 2:1 ratio (each share worth 2 assets)

        await mockVaultToken.setBalance(users[0].address, userShares);
        await mockVaultToken.setTotalSupply(totalShares);
        await mockVaultToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockVaultToken.getAddress(),
          [users[0].address],
        );

        // Expected: 100 shares * 2 assets/share = 200 assets, normalized to 18 decimals
        expect(balances[0]).to.equal(parseUnits("200", 18));
      });

      it("should handle multiple addresses in one call", async () => {
        const shares1 = parseUnits("100", 6);
        const shares2 = parseUnits("200", 6);
        const totalShares = parseUnits("1000", 6);
        const totalAssets = parseUnits("1500", 6); // 1.5:1 ratio

        await mockVaultToken.setBalance(users[0].address, shares1);
        await mockVaultToken.setBalance(users[1].address, shares2);
        await mockVaultToken.setTotalSupply(totalShares);
        await mockVaultToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockVaultToken.getAddress(),
          [users[0].address, users[1].address],
        );

        // Expected: shares * 1.5 assets/share, normalized to 18 decimals
        expect(balances[0]).to.equal(parseUnits("150", 18)); // 100 * 1.5
        expect(balances[1]).to.equal(parseUnits("300", 18)); // 200 * 1.5
      });

      it("should return zero balance when user has no shares", async () => {
        const totalShares = parseUnits("1000", 6);
        const totalAssets = parseUnits("1000", 6);

        await mockVaultToken.setTotalSupply(totalShares);
        await mockVaultToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockVaultToken.getAddress(),
          [users[0].address],
        );

        expect(balances[0]).to.equal(0);
      });
    });

    describe("when passing external token", () => {
      it("should handle external token balances with 18 decimals", async () => {
        const userBalance = parseEther("100");

        await mockExternalToken["mint(address,uint256)"](
          users[0].address,
          userBalance,
        );

        const balances = await balanceChecker.tokenBalances(
          await mockExternalToken.getAddress(),
          [users[0].address],
        );

        // External token with 18 decimals - no conversion needed
        expect(balances[0]).to.equal(userBalance);
      });

      it("should revert for unmapped external token", async () => {
        // Deploy a new token that hasn't been mapped
        const TestnetERC20 = (await ethers.getContractFactory(
          "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
        )) as TestnetERC20Factory;
        const unmappedToken = await TestnetERC20.deploy(
          "Unmapped Token",
          "UNMAP",
          18,
          _deployer.address,
        );

        await (unmappedToken.connect(_deployer) as any).setProtected(false);
        await unmappedToken["mint(address,uint256)"](
          users[0].address,
          parseEther("100"),
        );

        await expect(
          balanceChecker.tokenBalances(await unmappedToken.getAddress(), [
            users[0].address,
          ]),
        )
          .to.be.revertedWithCustomError(
            balanceChecker,
            "ExternalTokenNotMapped",
          )
          .withArgs(await unmappedToken.getAddress());
      });
    });
  });

  describe("batchTokenBalances", () => {
    it("should handle multiple vault sources", async () => {
      // Deploy second vault token
      const mockUnderlying2 = await (
        await ethers.getContractFactory(
          "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
        )
      ).deploy("Mock dUSD 2", "dUSD2", 6, _deployer.address);

      const mockVault2 = await (
        await ethers.getContractFactory(
          "contracts/token/MockERC4626Token.sol:MockERC4626Token",
        )
      ).deploy(await mockUnderlying2.getAddress(), "Mock Vault 2", "MVT2");

      // Setup first vault token: 100 shares -> 150 assets (1.5:1 ratio)
      await mockVaultToken.setBalance(users[0].address, parseUnits("100", 6));
      await mockVaultToken.setTotalSupply(parseUnits("1000", 6));
      await mockVaultToken.setTotalAssets(parseUnits("1500", 6));

      // Setup second vault token: 200 shares -> 200 assets (1:1 ratio)
      await mockVault2.setBalance(users[0].address, parseUnits("200", 6));
      await mockVault2.setTotalSupply(parseUnits("1000", 6));
      await mockVault2.setTotalAssets(parseUnits("1000", 6));

      const balances = await balanceChecker.batchTokenBalances(
        [await mockVaultToken.getAddress(), await mockVault2.getAddress()],
        [users[0].address],
      );

      // Expected: 150 + 200 = 350 (normalized to 18 decimals)
      expect(balances[0]).to.equal(parseUnits("350", 18));
    });

    it("should revert when no sources are provided", async () => {
      await expect(
        balanceChecker.batchTokenBalances([], [users[0].address]),
      ).to.be.revertedWithCustomError(balanceChecker, "NoSourcesProvided");
    });
  });

  describe("utility functions", () => {
    describe("getUnderlyingAsset", () => {
      it("should return the underlying asset address", async () => {
        const underlyingAsset = await balanceChecker.getUnderlyingAsset(
          await mockVaultToken.getAddress(),
        );
        expect(underlyingAsset).to.equal(
          await mockUnderlyingToken.getAddress(),
        );
      });
    });

    describe("convertSharesToAssets", () => {
      it("should convert shares to assets correctly", async () => {
        await mockVaultToken.setTotalSupply(parseUnits("1000", 6));
        await mockVaultToken.setTotalAssets(parseUnits("1500", 6)); // 1.5:1 ratio

        const assets = await balanceChecker.convertSharesToAssets(
          await mockVaultToken.getAddress(),
          parseUnits("100", 6), // 100 shares
        );

        expect(assets).to.equal(parseUnits("150", 6)); // 150 assets
      });
    });

    describe("getTotalAssets", () => {
      it("should return total assets correctly", async () => {
        await mockVaultToken.setTotalAssets(parseUnits("1500", 6));

        const totalAssets = await balanceChecker.getTotalAssets(
          await mockVaultToken.getAddress(),
        );

        expect(totalAssets).to.equal(parseUnits("1500", 6));
      });
    });
  });

  describe("mapExternalSource", () => {
    it("should allow admin to map external sources", async () => {
      const newExternalToken = await (
        await ethers.getContractFactory(
          "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
        )
      ).deploy("New External", "NEW", 18, _deployer.address);

      await balanceChecker.mapExternalSource(
        await newExternalToken.getAddress(),
        await mockVaultToken.getAddress(),
      );

      expect(
        await balanceChecker.externalSourceToInternalToken(
          await newExternalToken.getAddress(),
        ),
      ).to.equal(await mockVaultToken.getAddress());
    });

    it("should revert when non-admin tries to map", async () => {
      await expect(
        balanceChecker
          .connect(users[0])
          .mapExternalSource(
            await mockExternalToken.getAddress(),
            await mockVaultToken.getAddress(),
          ),
      ).to.be.reverted;
    });
  });
});
