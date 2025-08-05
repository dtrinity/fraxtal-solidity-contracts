import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { type BigNumberish, parseEther } from "ethers";
import { ethers } from "hardhat";

import { TypedContractMethod } from "../../typechain-types/common";
import type { DLendBalanceChecker } from "../../typechain-types/contracts/fxtl_balance_checkers/implementations/DLendBalanceChecker";
import type { TestnetERC20 } from "../../typechain-types/contracts/lending/periphery/mocks/testnet-helpers/TestnetERC20";
import type { MockAToken } from "../../typechain-types/contracts/mocks/MockAToken";
import type { MockPool } from "../../typechain-types/contracts/mocks/MockPool";
import type { MockVariableDebtToken } from "../../typechain-types/contracts/mocks/MockVariableDebtToken";
import { DLendBalanceChecker__factory as DLendBalanceCheckerFactory } from "../../typechain-types/factories/contracts/fxtl_balance_checkers/implementations/DLendBalanceChecker__factory";
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

describe("DLendBalanceChecker", () => {
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
      "contracts/fxtl_balance_checkers/implementations/DLendBalanceChecker.sol:DLendBalanceChecker",
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

    // Map external token to underlying asset
    await balanceChecker.mapExternalSource(
      await mockExternalToken.getAddress(), // external token
      await mockUnderlyingToken.getAddress(), // underlying asset
    );

    // Disable protection on mock tokens to allow minting
    await (mockExternalToken.connect(_deployer) as any).setProtected(false);
    await (mockUnderlyingToken.connect(_deployer) as any).setProtected(false);
  });

  describe("constructor", () => {
    it("should set pool address correctly", async () => {
      const poolAddress = await balanceChecker.pool();
      expect(poolAddress).to.equal(await mockPool.getAddress());
    });
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
          await mockUnderlyingToken.getAddress(), // Pass underlying asset address
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
          await mockUnderlyingToken.getAddress(),
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
          await mockUnderlyingToken.getAddress(),
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
          await mockUnderlyingToken.getAddress(),
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
          await mockUnderlyingToken.getAddress(),
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
          .to.be.revertedWithCustomError(balanceChecker, "InvalidDebtToken")
          .withArgs(await unmappedToken.getAddress());
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
        [
          await mockUnderlyingToken.getAddress(),
          await mockUnderlyingToken2.getAddress(),
        ],
        [users[0].address],
      );

      // Expected: balance1 * 0.8 + balance2 * 0.6
      const expected = (balance1 * 80n) / 100n + (balance2 * 60n) / 100n;
      expect(balances[0]).to.equal(expected);
    });

    it("should revert when no sources are provided", async () => {
      await expect(
        balanceChecker.batchTokenBalances([], [users[0].address]),
      ).to.be.revertedWithCustomError(balanceChecker, "NoSourcesProvided");
    });
  });

  describe("utility functions", () => {
    describe("getUtilizationRatio", () => {
      it("should return correct utilization ratio", async () => {
        await mockAToken.setTotalSupply(parseEther("1000"));
        await mockDebtToken.setTotalSupply(parseEther("300")); // 30% utilization

        const utilization = await balanceChecker.getUtilizationRatio(
          await mockUnderlyingToken.getAddress(),
        );

        // 30% utilization = 0.3e18
        expect(utilization).to.equal(parseEther("0.3"));
      });
    });

    describe("getAvailableRatio", () => {
      it("should return correct available ratio", async () => {
        await mockAToken.setTotalSupply(parseEther("1000"));
        await mockDebtToken.setTotalSupply(parseEther("300")); // 30% utilization

        const available = await balanceChecker.getAvailableRatio(
          await mockUnderlyingToken.getAddress(),
        );

        // 70% available = 0.7e18
        expect(available).to.equal(parseEther("0.7"));
      });
    });

    describe("getDebtToken", () => {
      it("should return correct debt token address", async () => {
        const debtToken = await balanceChecker.getDebtToken(
          await mockUnderlyingToken.getAddress(),
        );

        expect(debtToken).to.equal(await mockDebtToken.getAddress());
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
        await mockUnderlyingToken.getAddress(),
      );

      expect(
        await balanceChecker.externalSourceToInternalToken(
          await newExternalToken.getAddress(),
        ),
      ).to.equal(await mockUnderlyingToken.getAddress());
    });

    it("should revert when non-admin tries to map", async () => {
      await expect(
        balanceChecker
          .connect(users[0])
          .mapExternalSource(
            await mockExternalToken.getAddress(),
            await mockUnderlyingToken.getAddress(),
          ),
      ).to.be.reverted;
    });
  });
});
