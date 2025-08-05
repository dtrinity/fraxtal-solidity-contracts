import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { type BigNumberish, parseEther, parseUnits } from "ethers";
import { ethers } from "hardhat";

import { TypedContractMethod } from "../../../typechain-types/common";
// Contract types
import type { SdUSDBalanceChecker } from "../../../typechain-types/contracts/vaults/dstake/SdUSDBalanceChecker";
import type { TestnetERC20 } from "../../../typechain-types/contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20";
import type { MockERC4626Token } from "../../../typechain-types/contracts/token/MockERC4626Token";
// Contract factories
import { SdUSDBalanceChecker__factory as SdUSDBalanceCheckerFactory } from "../../../typechain-types/factories/contracts/vaults/dstake/SdUSDBalanceChecker__factory";
import { TestnetERC20__factory as TestnetERC20Factory } from "../../../typechain-types/factories/contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20__factory";
import { MockERC4626Token__factory as MockERC4626TokenFactory } from "../../../typechain-types/factories/contracts/token/MockERC4626Token__factory";

// Add setters to mock contract types
interface MockERC4626TokenWithSetters extends MockERC4626Token {
  setTotalAssets: TypedContractMethod<
    [totalAssets_: BigNumberish],
    [void],
    "nonpayable"
  >;
  setTotalSupply: TypedContractMethod<
    [totalSupply_: BigNumberish],
    [void],
    "nonpayable"
  >;
  setBalance: TypedContractMethod<
    [account: string, balance: BigNumberish],
    [void],
    "nonpayable"
  >;
}

describe("sdUSDBalanceChecker", () => {
  let balanceChecker: SdUSDBalanceChecker;
  let mockSdUSDToken: MockERC4626TokenWithSetters;
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
    mockSdUSDToken = await MockERC4626Token.deploy(
      await mockUnderlyingToken.getAddress(),
      "Mock sdUSD",
      "sdUSD",
    );

    // Deploy balance checker
    const SdUSDBalanceChecker = (await ethers.getContractFactory(
      "contracts/vaults/dstake/sdUSDBalanceChecker.sol:sdUSDBalanceChecker",
    )) as SdUSDBalanceCheckerFactory;
    balanceChecker = await SdUSDBalanceChecker.deploy(_deployer.address);

    // Map external token to sdUSD token
    await balanceChecker.mapExternalSource(
      await mockExternalToken.getAddress(),
      await mockSdUSDToken.getAddress(),
    );

    // Disable protection on mock tokens to allow minting
    await (mockUnderlyingToken.connect(_deployer) as any).setProtected(false);
    await (mockExternalToken.connect(_deployer) as any).setProtected(false);
  });

  describe("constructor", () => {
    it("should set admin role correctly", async () => {
      const DEFAULT_ADMIN_ROLE = await balanceChecker.DEFAULT_ADMIN_ROLE();
      expect(await balanceChecker.hasRole(DEFAULT_ADMIN_ROLE, _deployer.address)).to.be.true;
    });

    it("should map SD_USD_TOKEN to itself", async () => {
      const sdUsdToken = await balanceChecker.SD_USD_TOKEN();
      expect(await balanceChecker.externalSourceToSdUSDToken(sdUsdToken)).to.equal(sdUsdToken);
    });

    it("should revert with zero admin address", async () => {
      const SdUSDBalanceChecker = (await ethers.getContractFactory(
        "contracts/vaults/dstake/sdUSDBalanceChecker.sol:sdUSDBalanceChecker",
      )) as SdUSDBalanceCheckerFactory;
      
      await expect(
        SdUSDBalanceChecker.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("INVALID_ADMIN_ADDRESS");
    });
  });

  describe("mapExternalSource", () => {
    it("should allow admin to map external sources", async () => {
      const newExternalToken = await (await ethers.getContractFactory(
        "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
      )).deploy("New External", "NEW", 18, _deployer.address);

      await balanceChecker.mapExternalSource(
        await newExternalToken.getAddress(),
        await mockSdUSDToken.getAddress(),
      );

      expect(
        await balanceChecker.externalSourceToSdUSDToken(await newExternalToken.getAddress())
      ).to.equal(await mockSdUSDToken.getAddress());
    });

    it("should revert when non-admin tries to map", async () => {
      await expect(
        balanceChecker.connect(users[0]).mapExternalSource(
          await mockExternalToken.getAddress(),
          await mockSdUSDToken.getAddress(),
        )
      ).to.be.reverted;
    });

    it("should revert with zero sdUSD token address", async () => {
      await expect(
        balanceChecker.mapExternalSource(
          await mockExternalToken.getAddress(),
          ethers.ZeroAddress,
        )
      ).to.be.revertedWith("INVALID_SDUSD_TOKEN_ADDRESS");
    });
  });

  describe("tokenBalances", () => {
    describe("when passing sdUSD token directly", () => {
      it("should return correct balance with 1:1 share-to-asset ratio", async () => {
        const userShares = parseUnits("100", 6); // 100 shares with 6 decimals
        const totalShares = parseUnits("1000", 6);
        const totalAssets = parseUnits("1000", 6); // 1:1 ratio

        await mockSdUSDToken.setBalance(users[0].address, userShares);
        await mockSdUSDToken.setTotalSupply(totalShares);
        await mockSdUSDToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockSdUSDToken.getAddress(),
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

        await mockSdUSDToken.setBalance(users[0].address, userShares);
        await mockSdUSDToken.setTotalSupply(totalShares);
        await mockSdUSDToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockSdUSDToken.getAddress(),
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

        await mockSdUSDToken.setBalance(users[0].address, shares1);
        await mockSdUSDToken.setBalance(users[1].address, shares2);
        await mockSdUSDToken.setTotalSupply(totalShares);
        await mockSdUSDToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockSdUSDToken.getAddress(),
          [users[0].address, users[1].address],
        );

        // Expected: shares * 1.5 assets/share, normalized to 18 decimals
        expect(balances[0]).to.equal(parseUnits("150", 18)); // 100 * 1.5
        expect(balances[1]).to.equal(parseUnits("300", 18)); // 200 * 1.5
      });

      it("should return zero balance when user has no shares", async () => {
        const totalShares = parseUnits("1000", 6);
        const totalAssets = parseUnits("1000", 6);

        await mockSdUSDToken.setTotalSupply(totalShares);
        await mockSdUSDToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockSdUSDToken.getAddress(),
          [users[0].address],
        );

        expect(balances[0]).to.equal(0);
      });

      it("should handle edge case with zero shares", async () => {
        const userShares = 0n;
        const totalShares = parseUnits("1000", 6);
        const totalAssets = parseUnits("1000", 6);

        await mockSdUSDToken.setBalance(users[0].address, userShares);
        await mockSdUSDToken.setTotalSupply(totalShares);
        await mockSdUSDToken.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockSdUSDToken.getAddress(),
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

      it("should handle external token with 6 decimals", async () => {
        // Deploy a new external token with 6 decimals
        const TestnetERC20 = (await ethers.getContractFactory(
          "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
        )) as TestnetERC20Factory;
        const mockExternalToken6Dec = await TestnetERC20.deploy(
          "Mock External 6Dec",
          "MEXT6",
          6,
          _deployer.address,
        );
        await (mockExternalToken6Dec.connect(_deployer) as any).setProtected(false);

        // Map the new token to sdUSD token
        await balanceChecker.mapExternalSource(
          await mockExternalToken6Dec.getAddress(),
          await mockSdUSDToken.getAddress(),
        );

        const userBalance = parseUnits("100", 6); // 100 tokens with 6 decimals
        await mockExternalToken6Dec["mint(address,uint256)"](
          users[0].address,
          userBalance,
        );

        const balances = await balanceChecker.tokenBalances(
          await mockExternalToken6Dec.getAddress(),
          [users[0].address],
        );

        // Expected: 100 tokens normalized from 6 to 18 decimals
        expect(balances[0]).to.equal(parseUnits("100", 18));
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

    describe("when handling different decimal configurations", () => {
      it("should handle sdUSD token with 18 decimals", async () => {
        // Deploy underlying token with 18 decimals
        const mockUnderlying18Dec = await (await ethers.getContractFactory(
          "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
        )).deploy("Mock 18Dec", "M18", 18, _deployer.address);
        
        // Deploy ERC4626 with 18 decimal underlying
        const mockSdUSD18Dec = await (await ethers.getContractFactory(
          "contracts/token/MockERC4626Token.sol:MockERC4626Token",
        )).deploy(
          await mockUnderlying18Dec.getAddress(),
          "Mock sdUSD 18Dec",
          "sdUSD18",
        );

        const userShares = parseEther("100"); // 100 shares with 18 decimals
        const totalShares = parseEther("1000");
        const totalAssets = parseEther("1500"); // 1.5:1 ratio

        await mockSdUSD18Dec.setBalance(users[0].address, userShares);
        await mockSdUSD18Dec.setTotalSupply(totalShares);
        await mockSdUSD18Dec.setTotalAssets(totalAssets);

        const balances = await balanceChecker.tokenBalances(
          await mockSdUSD18Dec.getAddress(),
          [users[0].address],
        );

        // Expected: 100 shares * 1.5 assets/share = 150 assets, already 18 decimals
        expect(balances[0]).to.equal(parseEther("150"));
      });

      it("should handle mixed decimal tokens in batch", async () => {
        // Create 18 decimal external token
        const external18Dec = await (await ethers.getContractFactory(
          "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
        )).deploy("Ext18", "E18", 18, _deployer.address);
        await (external18Dec.connect(_deployer) as any).setProtected(false);
        
        // Map to sdUSD token (6 decimals)
        await balanceChecker.mapExternalSource(
          await external18Dec.getAddress(),
          await mockSdUSDToken.getAddress(),
        );

        // Setup balances
        await external18Dec["mint(address,uint256)"](users[0].address, parseEther("100"));
        
        // Setup sdUSD token (6 decimals)
        await mockSdUSDToken.setBalance(users[0].address, parseUnits("50", 6));
        await mockSdUSDToken.setTotalSupply(parseUnits("1000", 6));
        await mockSdUSDToken.setTotalAssets(parseUnits("1000", 6)); // 1:1 ratio

        const balances = await balanceChecker.batchTokenBalances(
          [await external18Dec.getAddress(), await mockSdUSDToken.getAddress()],
          [users[0].address],
        );

        // Expected: 100 (from 18-decimal external) + 50 (from 6-decimal sdUSD normalized) = 150
        expect(balances[0]).to.equal(parseEther("150"));
      });
    });

    it("should enforce address limit", async () => {
      const addresses = Array(1001).fill(users[0].address);
      
      await expect(
        balanceChecker.tokenBalances(await mockSdUSDToken.getAddress(), addresses)
      ).to.be.revertedWith("TOO_MANY_ADDRESSES");
    });
  });

  describe("batchTokenBalances", () => {
    it("should handle multiple sdUSD sources", async () => {
      // Deploy second sdUSD token
      const mockUnderlying2 = await (await ethers.getContractFactory(
        "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
      )).deploy("Mock dUSD 2", "dUSD2", 6, _deployer.address);

      const mockSdUSD2 = await (await ethers.getContractFactory(
        "contracts/token/MockERC4626Token.sol:MockERC4626Token",
      )).deploy(
        await mockUnderlying2.getAddress(),
        "Mock sdUSD 2",
        "sdUSD2",
      );

      // Setup first sdUSD token: 100 shares -> 150 assets (1.5:1 ratio)
      await mockSdUSDToken.setBalance(users[0].address, parseUnits("100", 6));
      await mockSdUSDToken.setTotalSupply(parseUnits("1000", 6));
      await mockSdUSDToken.setTotalAssets(parseUnits("1500", 6));

      // Setup second sdUSD token: 200 shares -> 200 assets (1:1 ratio)
      await mockSdUSD2.setBalance(users[0].address, parseUnits("200", 6));
      await mockSdUSD2.setTotalSupply(parseUnits("1000", 6));
      await mockSdUSD2.setTotalAssets(parseUnits("1000", 6));

      const balances = await balanceChecker.batchTokenBalances(
        [await mockSdUSDToken.getAddress(), await mockSdUSD2.getAddress()],
        [users[0].address],
      );

      // Expected: 150 + 200 = 350 (normalized to 18 decimals)
      expect(balances[0]).to.equal(parseUnits("350", 18));
    });

    it("should skip zero addresses", async () => {
      await mockSdUSDToken.setBalance(users[0].address, parseUnits("100", 6));
      await mockSdUSDToken.setTotalSupply(parseUnits("1000", 6));
      await mockSdUSDToken.setTotalAssets(parseUnits("1000", 6));

      const balances = await balanceChecker.batchTokenBalances(
        [ethers.ZeroAddress, await mockSdUSDToken.getAddress(), ethers.ZeroAddress],
        [users[0].address],
      );

      // Expected: only the sdUSD token balance (100 normalized to 18 decimals)
      expect(balances[0]).to.equal(parseUnits("100", 18));
    });

    it("should skip invalid sources silently", async () => {
      // Deploy a non-ERC4626 token
      const invalidToken = await (await ethers.getContractFactory(
        "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
      )).deploy("Invalid", "INV", 18, _deployer.address);

      await mockSdUSDToken.setBalance(users[0].address, parseUnits("100", 6));
      await mockSdUSDToken.setTotalSupply(parseUnits("1000", 6));
      await mockSdUSDToken.setTotalAssets(parseUnits("1000", 6));

      const balances = await balanceChecker.batchTokenBalances(
        [await invalidToken.getAddress(), await mockSdUSDToken.getAddress()],
        [users[0].address],
      );

      // Expected: only the valid sdUSD token balance
      expect(balances[0]).to.equal(parseUnits("100", 18));
    });

    it("should revert when no sources are provided", async () => {
      await expect(
        balanceChecker.batchTokenBalances([], [users[0].address]),
      ).to.be.revertedWith("NO_SOURCES_PROVIDED");
    });

    it("should enforce address limit", async () => {
      const addresses = Array(1001).fill(users[0].address);
      
      await expect(
        balanceChecker.batchTokenBalances([await mockSdUSDToken.getAddress()], addresses)
      ).to.be.revertedWith("TOO_MANY_ADDRESSES");
    });
  });

  describe("utility functions", () => {
    describe("getUnderlyingAsset", () => {
      it("should return the underlying asset address", async () => {
        const underlyingAsset = await balanceChecker.getUnderlyingAsset(
          await mockSdUSDToken.getAddress()
        );
        expect(underlyingAsset).to.equal(await mockUnderlyingToken.getAddress());
      });
    });

    describe("convertSharesToAssets", () => {
      it("should convert shares to assets correctly", async () => {
        await mockSdUSDToken.setTotalSupply(parseUnits("1000", 6));
        await mockSdUSDToken.setTotalAssets(parseUnits("1500", 6)); // 1.5:1 ratio

        const assets = await balanceChecker.convertSharesToAssets(
          await mockSdUSDToken.getAddress(),
          parseUnits("100", 6) // 100 shares
        );

        expect(assets).to.equal(parseUnits("150", 6)); // 150 assets
      });
    });

    describe("convertAssetsToShares", () => {
      it("should convert assets to shares correctly", async () => {
        await mockSdUSDToken.setTotalSupply(parseUnits("1000", 6));
        await mockSdUSDToken.setTotalAssets(parseUnits("1500", 6)); // 1.5:1 ratio

        const shares = await balanceChecker.convertAssetsToShares(
          await mockSdUSDToken.getAddress(),
          parseUnits("150", 6) // 150 assets
        );

        expect(shares).to.equal(parseUnits("100", 6)); // 100 shares
      });
    });
  });
});