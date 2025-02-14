import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { type BigNumberish, parseEther } from "ethers";
import { ethers } from "hardhat";

import { TypedContractMethod } from "../../typechain-types/common";
// Contract types
import type { DLendBalanceChecker } from "../../typechain-types/contracts/dlend/DLendBalanceChecker";
import type { TestnetERC20 } from "../../typechain-types/contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20";
import type { MockAToken } from "../../typechain-types/contracts/mocks/MockAToken";
import type { MockPool } from "../../typechain-types/contracts/mocks/MockPool";
import type { MockVariableDebtToken } from "../../typechain-types/contracts/mocks/MockVariableDebtToken";
// Contract factories
import { DLendBalanceChecker__factory as DLendBalanceCheckerFactory } from "../../typechain-types/factories/contracts/dlend/DLendBalanceChecker__factory";
import { TestnetERC20__factory as TestnetERC20Factory } from "../../typechain-types/factories/contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20__factory";
import { MockAToken__factory as MockATokenFactory } from "../../typechain-types/factories/contracts/mocks/MockAToken__factory";
import { MockPool__factory as MockPoolFactory } from "../../typechain-types/factories/contracts/mocks/MockPool__factory";
import { MockVariableDebtToken__factory as MockVariableDebtTokenFactory } from "../../typechain-types/factories/contracts/mocks/MockVariableDebtToken__factory";

// Add setDecimals to mock contract types
interface MockATokenWithSetDecimals extends MockAToken {
  setDecimals: TypedContractMethod<
    [decimals_: BigNumberish],
    [void],
    "nonpayable"
  >;
}

interface MockVariableDebtTokenWithSetDecimals extends MockVariableDebtToken {
  setDecimals: TypedContractMethod<
    [decimals_: BigNumberish],
    [void],
    "nonpayable"
  >;
}

describe("dLendBalanceChecker", () => {
  let balanceChecker: DLendBalanceChecker;
  let mockPool: MockPool;
  let mockAToken: MockATokenWithSetDecimals;
  let mockDebtToken: MockVariableDebtTokenWithSetDecimals;
  let mockExternalToken: TestnetERC20;
  let mockUnderlyingToken: TestnetERC20;
  let _deployer: SignerWithAddress;
  let users: SignerWithAddress[];

  beforeEach(async () => {
    [_deployer, ...users] = await ethers.getSigners();

    // Deploy mock ERC20 tokens
    const TestnetERC20 = (await ethers.getContractFactory(
      "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
    )) as TestnetERC20Factory;
    mockExternalToken = await TestnetERC20.deploy(
      "Mock External",
      "MEXT",
      18,
      _deployer.address,
    );
    mockUnderlyingToken = await TestnetERC20.deploy(
      "Mock Underlying",
      "MUND",
      18,
      _deployer.address,
    );

    // Deploy mock contracts
    const MockPool = (await ethers.getContractFactory(
      "contracts/mocks/MockPool.sol:MockPool",
    )) as MockPoolFactory;
    mockPool = await MockPool.deploy();

    const MockAToken = (await ethers.getContractFactory(
      "contracts/mocks/MockAToken.sol:MockAToken",
    )) as MockATokenFactory;
    mockAToken = await MockAToken.deploy();

    const MockVariableDebtToken = (await ethers.getContractFactory(
      "contracts/mocks/MockVariableDebtToken.sol:MockVariableDebtToken",
    )) as MockVariableDebtTokenFactory;
    mockDebtToken = await MockVariableDebtToken.deploy();

    // Deploy balance checker
    const DLendBalanceChecker = (await ethers.getContractFactory(
      "contracts/dlend/dLendBalanceChecker.sol:dLendBalanceChecker",
    )) as DLendBalanceCheckerFactory;
    balanceChecker = await DLendBalanceChecker.deploy(
      await mockPool.getAddress(),
    );

    // Setup mock AToken with underlying asset
    await mockAToken.setUnderlyingAsset(await mockUnderlyingToken.getAddress());
    await mockAToken.setTotalSupply(0);

    // Setup mock pool to return mock tokens - use underlying asset as key
    await mockPool.setReserveData(
      await mockUnderlyingToken.getAddress(), // underlying asset address
      await mockAToken.getAddress(), // aToken address
      await mockDebtToken.getAddress(), // debtToken address
    );

    // Map external token to dToken (aToken)
    await balanceChecker.mapExternalSource(
      await mockExternalToken.getAddress(), // external token
      await mockAToken.getAddress(), // aToken as dToken
    );

    // Disable protection on mock tokens to allow minting
    await (mockExternalToken.connect(_deployer) as any).setProtected(false);
    await (mockUnderlyingToken.connect(_deployer) as any).setProtected(false);
  });

  describe("tokenBalances", () => {
    describe("when passing aToken directly", () => {
      it("should return full balance when there is no debt", async () => {
        const userBalance = parseEther("100");
        const totalSupply = parseEther("1000");

        await mockAToken.setBalance(users[0].address, userBalance);
        await mockAToken.setTotalSupply(totalSupply);
        await mockDebtToken.setTotalSupply(0);

        const balances = await balanceChecker.tokenBalances(
          await mockAToken.getAddress(), // Pass aToken address directly
          [users[0].address],
        );

        expect(balances[0]).to.equal(userBalance);
      });

      it("should return partial balance when there is debt", async () => {
        const userBalance = parseEther("100");
        const totalSupply = parseEther("1000");
        const totalDebt = parseEther("500"); // 50% utilization

        await mockAToken.setBalance(users[0].address, userBalance);
        await mockAToken.setTotalSupply(totalSupply);
        await mockDebtToken.setTotalSupply(totalDebt);

        const balances = await balanceChecker.tokenBalances(
          await mockAToken.getAddress(),
          [users[0].address],
        );

        // With 50% utilization, effective balance should be 50% of actual balance
        expect(balances[0]).to.equal(userBalance / 2n);
      });

      it("should handle multiple addresses in one call", async () => {
        const balance1 = parseEther("100");
        const balance2 = parseEther("200");
        const totalSupply = parseEther("1000");
        const totalDebt = parseEther("200"); // 20% utilization

        await mockAToken.setBalance(users[0].address, balance1);
        await mockAToken.setBalance(users[1].address, balance2);
        await mockAToken.setTotalSupply(totalSupply);
        await mockDebtToken.setTotalSupply(totalDebt);

        const balances = await balanceChecker.tokenBalances(
          await mockAToken.getAddress(),
          [users[0].address, users[1].address],
        );

        // With 20% utilization, effective balance should be 80% of actual balance
        expect(balances[0]).to.equal((balance1 * 80n) / 100n);
        expect(balances[1]).to.equal((balance2 * 80n) / 100n);
      });

      it("should return zero balances when total supply is zero", async () => {
        await mockAToken.setBalance(users[0].address, parseEther("100"));
        await mockAToken.setTotalSupply(0);
        await mockDebtToken.setTotalSupply(0);

        const balances = await balanceChecker.tokenBalances(
          await mockAToken.getAddress(),
          [users[0].address],
        );

        expect(balances[0]).to.equal(0);
      });

      it("should return zero balances when debt equals or exceeds supply", async () => {
        const totalSupply = parseEther("1000");
        await mockAToken.setBalance(users[0].address, parseEther("100"));
        await mockAToken.setTotalSupply(totalSupply);
        await mockDebtToken.setTotalSupply(totalSupply);

        const balances = await balanceChecker.tokenBalances(
          await mockAToken.getAddress(),
          [users[0].address],
        );

        expect(balances[0]).to.equal(0);
      });
    });

    describe("when passing external token", () => {
      it("should handle external token balances", async () => {
        const userBalance = parseEther("100");
        const totalSupply = parseEther("1000");

        // Use the specific mint function signature
        await mockExternalToken["mint(address,uint256)"](
          users[0].address,
          userBalance,
        ),
          await mockAToken.setTotalSupply(totalSupply);
        await mockDebtToken.setTotalSupply(0);

        const balances = await balanceChecker.tokenBalances(
          await mockExternalToken.getAddress(),
          [users[0].address],
        );

        expect(balances[0]).to.equal(userBalance);
      });

      it("should return zero balance when user has no tokens", async () => {
        const totalSupply = parseEther("1000");
        await mockAToken.setTotalSupply(totalSupply);
        await mockDebtToken.setTotalSupply(0);

        const balances = await balanceChecker.tokenBalances(
          await mockExternalToken.getAddress(),
          [users[0].address],
        );

        expect(balances[0]).to.equal(0n);
      });

      it("should handle external token with different decimals", async () => {
        // Deploy a new token with 6 decimals
        const TestnetERC20 = (await ethers.getContractFactory(
          "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
        )) as TestnetERC20Factory;
        const mockExternalToken6Decimals = await TestnetERC20.deploy(
          "Mock Underlying 6Decimals",
          "MEXT6",
          6,
          _deployer.address,
        );
        await (
          mockExternalToken6Decimals.connect(_deployer) as any
        ).setProtected(false);

        // Map the new token to the existing aToken
        await balanceChecker.mapExternalSource(
          await mockExternalToken6Decimals.getAddress(),
          await mockAToken.getAddress(),
        );

        const userBalance = 1000000n; // 1 token with 6 decimals
        const expectedBalance = userBalance * 10n ** 12n; // 1 token with 18 decimals
        const totalSupply = parseEther("1000");

        await mockExternalToken6Decimals["mint(address,uint256)"](
          users[0].address,
          userBalance,
        );
        await mockAToken.setTotalSupply(totalSupply);
        await mockDebtToken.setTotalSupply(0);

        const balances = await balanceChecker.tokenBalances(
          await mockExternalToken6Decimals.getAddress(),
          [users[0].address],
        );

        expect(balances[0]).to.equal(expectedBalance);
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

    describe("when handling aTokens with different decimals", () => {
      it("should handle aToken with 6 decimals", async () => {
        // Deploy and setup aToken with 6 decimals
        const mockAToken6Dec = (await (
          await ethers.getContractFactory(
            "contracts/mocks/MockAToken.sol:MockAToken",
          )
        ).deploy()) as MockAToken;
        const mockUnderlying6Dec = (await (
          await ethers.getContractFactory(
            "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
          )
        ).deploy(
          "Mock Underlying 6Dec",
          "MUND6",
          6,
          _deployer.address,
        )) as TestnetERC20;
        const mockDebtToken6Dec = (await (
          await ethers.getContractFactory(
            "contracts/mocks/MockVariableDebtToken.sol:MockVariableDebtToken",
          )
        ).deploy()) as MockVariableDebtToken;

        // Set decimals for aToken and debt token
        await mockAToken6Dec.setDecimals(6);
        await mockDebtToken6Dec.setDecimals(6);

        // Setup the 6 decimal aToken
        await mockAToken6Dec.setUnderlyingAsset(
          await mockUnderlying6Dec.getAddress(),
        );
        await mockPool.setReserveData(
          await mockUnderlying6Dec.getAddress(),
          await mockAToken6Dec.getAddress(),
          await mockDebtToken6Dec.getAddress(),
        );

        // Set balances and utilization
        // 6 decimals: 1 token = 1_000_000 units
        await mockAToken6Dec.setBalance(users[0].address, 1_000_000n);
        await mockAToken6Dec.setTotalSupply(10_000_000n);
        await mockDebtToken6Dec.setTotalSupply(5_000_000n); // 50% utilization

        const balances = await balanceChecker.tokenBalances(
          await mockAToken6Dec.getAddress(),
          [users[0].address],
        );

        // With 50% utilization, effective balance should be 50% of actual balance
        // For 6 decimals: 1_000_000 / 2 = 500_000, then scale to 18 decimals
        const expected = (1_000_000n / 2n) * 10n ** 12n; // Scale from 6 to 18 decimals
        expect(balances[0]).to.equal(expected);
      });

      it("should handle aToken with 24 decimals", async () => {
        // Deploy a new aToken with 24 decimals
        const mockAToken24Dec = (await (
          await ethers.getContractFactory(
            "contracts/mocks/MockAToken.sol:MockAToken",
          )
        ).deploy()) as MockAToken;

        // Deploy underlying token with 24 decimals
        const mockUnderlying24Dec = (await (
          await ethers.getContractFactory(
            "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
          )
        ).deploy(
          "Mock Underlying 24Dec",
          "MUND24",
          24,
          _deployer.address,
        )) as TestnetERC20;

        // Deploy debt token
        const mockDebtToken24Dec = (await (
          await ethers.getContractFactory(
            "contracts/mocks/MockVariableDebtToken.sol:MockVariableDebtToken",
          )
        ).deploy()) as MockVariableDebtToken;

        // Set decimals for aToken and debt token
        await mockAToken24Dec.setDecimals(24);
        await mockDebtToken24Dec.setDecimals(24);

        // Setup the 24 decimal aToken
        await mockAToken24Dec.setUnderlyingAsset(
          await mockUnderlying24Dec.getAddress(),
        );
        await mockPool.setReserveData(
          await mockUnderlying24Dec.getAddress(),
          await mockAToken24Dec.getAddress(),
          await mockDebtToken24Dec.getAddress(),
        );

        // Set balances - 1 token with 24 decimals (1e24)
        const balance24Dec = 1_000_000_000_000_000_000_000_000n; // 1 token
        await mockAToken24Dec.setBalance(users[0].address, balance24Dec);
        await mockAToken24Dec.setTotalSupply(balance24Dec * 10n); // 10 tokens total
        await mockDebtToken24Dec.setTotalSupply(balance24Dec * 5n); // 5 tokens debt (50% utilization)

        const balances = await balanceChecker.tokenBalances(
          await mockAToken24Dec.getAddress(),
          [users[0].address],
        );

        // With 50% utilization, effective balance should be 50% of actual balance
        // For 24 decimals: 1e24 / 2 = 5e23, then scale down to 18 decimals
        const expected = balance24Dec / 2n / 10n ** 6n; // Scale from 24 to 18 decimals
        expect(balances[0]).to.equal(expected);
      });

      it("should handle mixed decimals in batch balance check", async () => {
        // Deploy and setup aToken with 6 decimals
        const mockAToken6Dec = (await (
          await ethers.getContractFactory(
            "contracts/mocks/MockAToken.sol:MockAToken",
          )
        ).deploy()) as MockAToken;
        const mockUnderlying6Dec = (await (
          await ethers.getContractFactory(
            "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
          )
        ).deploy(
          "Mock Underlying 6Dec",
          "MUND6",
          6,
          _deployer.address,
        )) as TestnetERC20;
        const mockDebtToken6Dec = (await (
          await ethers.getContractFactory(
            "contracts/mocks/MockVariableDebtToken.sol:MockVariableDebtToken",
          )
        ).deploy()) as MockVariableDebtToken;

        // Set decimals for 6 decimal tokens
        await mockAToken6Dec.setDecimals(6);
        await mockDebtToken6Dec.setDecimals(6);

        // Deploy and setup aToken with 24 decimals
        const mockAToken24Dec = (await (
          await ethers.getContractFactory(
            "contracts/mocks/MockAToken.sol:MockAToken",
          )
        ).deploy()) as MockAToken;
        const mockUnderlying24Dec = (await (
          await ethers.getContractFactory(
            "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
          )
        ).deploy(
          "Mock Underlying 24Dec",
          "MUND24",
          24,
          _deployer.address,
        )) as TestnetERC20;
        const mockDebtToken24Dec = (await (
          await ethers.getContractFactory(
            "contracts/mocks/MockVariableDebtToken.sol:MockVariableDebtToken",
          )
        ).deploy()) as MockVariableDebtToken;

        // Set decimals for 24 decimal tokens
        await mockAToken24Dec.setDecimals(24);
        await mockDebtToken24Dec.setDecimals(24);

        // Setup 6 decimal token
        await mockAToken6Dec.setUnderlyingAsset(
          await mockUnderlying6Dec.getAddress(),
        );
        await mockPool.setReserveData(
          await mockUnderlying6Dec.getAddress(),
          await mockAToken6Dec.getAddress(),
          await mockDebtToken6Dec.getAddress(),
        );

        // Setup 24 decimal token
        await mockAToken24Dec.setUnderlyingAsset(
          await mockUnderlying24Dec.getAddress(),
        );
        await mockPool.setReserveData(
          await mockUnderlying24Dec.getAddress(),
          await mockAToken24Dec.getAddress(),
          await mockDebtToken24Dec.getAddress(),
        );

        // Set balances and utilization
        // 6 decimals: 1 token = 1_000_000 units
        await mockAToken6Dec.setBalance(users[0].address, 1_000_000n);
        await mockAToken6Dec.setTotalSupply(10_000_000n);
        await mockDebtToken6Dec.setTotalSupply(5_000_000n); // 50% utilization

        // 24 decimals: 1 token = 1e24 units
        const balance24Dec = 1_000_000_000_000_000_000_000_000n; // 1 token
        await mockAToken24Dec.setBalance(users[0].address, balance24Dec);
        await mockAToken24Dec.setTotalSupply(balance24Dec * 10n); // 10 tokens total
        await mockDebtToken24Dec.setTotalSupply(balance24Dec * 5n); // 50% utilization

        const balances = await balanceChecker.batchTokenBalances(
          [
            await mockAToken6Dec.getAddress(),
            await mockAToken24Dec.getAddress(),
          ],
          [users[0].address],
        );

        // Both tokens have 50% utilization
        // 6 decimals: (1_000_000 / 2) * 1e12 = 0.5e18
        // 24 decimals: (1e24 / 2) / 1e6 = 0.5e18
        // Total should be 1e18 (1 token in 18 decimals)
        const expected6Dec = (1_000_000n / 2n) * 10n ** 12n; // Scale from 6 to 18 decimals
        const expected24Dec = balance24Dec / 2n / 10n ** 6n; // Scale from 24 to 18 decimals
        expect(balances[0]).to.equal(expected6Dec + expected24Dec);
      });
    });
  });

  describe("batchTokenBalances", () => {
    it("should handle multiple sources", async () => {
      // Deploy second set of mock tokens
      const MockAToken2 = (await ethers.getContractFactory(
        "contracts/mocks/MockAToken.sol:MockAToken",
      )) as MockATokenFactory;
      const mockAToken2 = await MockAToken2.deploy();

      const MockVariableDebtToken2 = (await ethers.getContractFactory(
        "contracts/mocks/MockVariableDebtToken.sol:MockVariableDebtToken",
      )) as MockVariableDebtTokenFactory;
      const mockDebtToken2 = await MockVariableDebtToken2.deploy();

      // Setup second token in mock pool with a different underlying asset
      const testnetErc20Two = (await ethers.getContractFactory(
        "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
      )) as TestnetERC20Factory;
      const mockUnderlyingToken2 = await testnetErc20Two.deploy(
        "Mock Underlying 2",
        "MUND2",
        18,
        _deployer.address,
      );
      await mockAToken2.setUnderlyingAsset(
        await mockUnderlyingToken2.getAddress(),
      );
      await mockPool.setReserveData(
        await mockUnderlyingToken2.getAddress(), // underlying asset address
        await mockAToken2.getAddress(), // aToken address
        await mockDebtToken2.getAddress(), // debtToken address,
      );

      // Setup balances and supplies for both tokens
      // Token 1: 80% available (20% debt)
      const balance1 = parseEther("100");
      await mockAToken.setBalance(users[0].address, balance1);
      await mockAToken.setTotalSupply(parseEther("1000"));
      await mockDebtToken.setTotalSupply(parseEther("200"));

      // Token 2: 60% available (40% debt)
      const balance2 = parseEther("200");
      await mockAToken2.setBalance(users[0].address, balance2);
      await mockAToken2.setTotalSupply(parseEther("1000"));
      await mockDebtToken2.setTotalSupply(parseEther("400"));

      const balances = await balanceChecker.batchTokenBalances(
        [await mockAToken.getAddress(), await mockAToken2.getAddress()],
        [users[0].address],
      );

      // Expected: balance1 * 0.8 + balance2 * 0.6
      const expected = (balance1 * 80n) / 100n + (balance2 * 60n) / 100n;
      expect(balances[0]).to.equal(expected);
    });

    it("should revert when no sources are provided", async () => {
      await expect(
        balanceChecker.batchTokenBalances([], [users[0].address]),
      ).to.be.revertedWith("NO_SOURCES_PROVIDED");
    });

    it("should handle multiple sources with different decimals", async () => {
      // Deploy token with 6 decimals and map it
      const TestnetERC6 = (await ethers.getContractFactory(
        "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
      )) as TestnetERC20Factory;
      const mockExternalToken6Dec = await TestnetERC6.deploy(
        "Mock External 6Dec",
        "MEXT6",
        6,
        _deployer.address,
      );
      await (mockExternalToken6Dec.connect(_deployer) as any).setProtected(
        false,
      );
      await balanceChecker.mapExternalSource(
        await mockExternalToken6Dec.getAddress(),
        await mockAToken.getAddress(),
      );

      // Deploy token with 24 decimals and map it
      const TestnetERC24 = (await ethers.getContractFactory(
        "contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20.sol:TestnetERC20",
      )) as TestnetERC20Factory;
      const mockExternalToken24Dec = await TestnetERC24.deploy(
        "Mock External 24Dec",
        "MEXT24",
        24,
        _deployer.address,
      );
      await (mockExternalToken24Dec.connect(_deployer) as any).setProtected(
        false,
      );
      await balanceChecker.mapExternalSource(
        await mockExternalToken24Dec.getAddress(),
        await mockAToken.getAddress(),
      );

      // Setup balances
      // 1 token with 6 decimals (1_000_000)
      await mockExternalToken6Dec["mint(address,uint256)"](
        users[0].address,
        1_000_000n,
      );
      // 1 token with 24 decimals (1 followed by 24 zeros)
      await mockExternalToken24Dec["mint(address,uint256)"](
        users[0].address,
        1_000_000_000_000_000_000_000_000n,
      );
      // 1 token with 18 decimals for the aToken
      await mockAToken.setBalance(users[0].address, parseEther("1"));

      // Set pool state - 50% utilization
      await mockAToken.setTotalSupply(parseEther("1000"));
      await mockDebtToken.setTotalSupply(parseEther("500"));

      const balances = await balanceChecker.batchTokenBalances(
        [
          await mockExternalToken6Dec.getAddress(),
          await mockExternalToken24Dec.getAddress(),
          await mockAToken.getAddress(),
        ],
        [users[0].address],
      );

      // Expected: All balances should be normalized to 18 decimals and then halved due to 50% utilization
      // 1 token from 6 decimals = 1e18
      // 1 token from 24 decimals = 1e18
      // 1 token from 18 decimals = 1e18
      // Total 3e18, then halved due to 50% utilization = 1.5e18
      expect(balances[0]).to.equal(parseEther("1.5"));
    });
  });
});
