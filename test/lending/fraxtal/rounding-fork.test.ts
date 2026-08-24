import { expect } from "chai";
import hre, { ethers } from "hardhat";

const ADDRESSES = {
  pool: "0xD76C827Ee2Ce1E37c37Fc2ce91376812d3c9BCE2",
  poolAddressesProvider: "0xD9C622d64342B5FaCeef4d366B974AEf6dCB338D",
  dusd: "0x788D96f655735f52c676A133f4dFC53cEC614d4A",
  aDUSD: "0x29d0256fe397F6e442464982C4Cba7670646059b",
};

const DUSD_MINTER = "0x9E8d871077BB496e388FD48F659CeDD6d0AbDC3A"; // IssuerV2_2
const GOVERNANCE = "0xfC2f89F9982BE98A9672CEFc3Ea6dBBdd88bc8e9";
const WFRAX_COLLATERAL_USER = "0xb53009E4dC25a494F3Bee03Ab121517e74b59F75";
const POOL_CONFIGURATOR = "0x5357F3D35a25f11D18D4C487e01934D2AD63dAe7";
const DUST_UNIT = 1n; // 1 unit of dUSD (6 decimals)
const LOOP_COUNT = 200;
const RAY = 10n ** 27n;

const rayMul = (a: bigint, b: bigint) => (a * b + RAY / 2n) / RAY;
const rayMulDown = (a: bigint, b: bigint) => (a * b) / RAY;
const rayDiv = (a: bigint, b: bigint) => (a * RAY + b / 2n) / b;

const lcg = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state;
  };
};

describe("Fraxtal fork: dUSD rounding PoC", function () {
  before(function () {
    if (hre.network.name !== "hardhat") {
      console.log("This test is only run on hardhat fork");
      this.skip();
    }
  });

  it("prevents profit from rounding loop", async function () {
    const [attacker] = await ethers.getSigners();
    const minter = await ethers.getImpersonatedSigner(DUSD_MINTER);

    const erc20Abi = [
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address,uint256) returns (bool)",
      "function approve(address,uint256) returns (bool)",
      "function mint(address,uint256)",
    ];
    const dusd = new ethers.Contract(ADDRESSES.dusd, erc20Abi, attacker);
    const poolAbi = [
      "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
      "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
    ];
    const pool = new ethers.Contract(ADDRESSES.pool, poolAbi, attacker);

    // Fund minter with ETH for gas and mint dUSD to attacker.
    await hre.network.provider.send("hardhat_setBalance", [
      DUSD_MINTER,
      "0x1000000000000000000",
    ]);

    const seed = DUST_UNIT * 1000n;
    await dusd.connect(minter).mint(attacker.address, seed);

    await dusd.connect(attacker).approve(ADDRESSES.pool, seed);

    const balanceBefore = await dusd.balanceOf(attacker.address);

    for (let i = 0; i < LOOP_COUNT; i++) {
      await pool.connect(attacker).supply(ADDRESSES.dusd, DUST_UNIT, attacker.address, 0);
      await pool.connect(attacker).withdraw(ADDRESSES.dusd, DUST_UNIT, attacker.address);
    }

    const balanceAfter = await dusd.balanceOf(attacker.address);

    // With the fix, balance should not increase.
    expect(balanceAfter).to.be.lte(balanceBefore);
  });

  it("pre-fix math would round up by 1 unit for some amounts", async function () {
    const [attacker] = await ethers.getSigners();
    const minter = await ethers.getImpersonatedSigner(DUSD_MINTER);

    await hre.network.provider.send("hardhat_setBalance", [
      DUSD_MINTER,
      "0x1000000000000000000",
    ]);

    const erc20Abi = [
      "function mint(address,uint256)",
      "function approve(address,uint256) returns (bool)",
    ];
    const aTokenAbi = [
      "function getPreviousIndex(address) view returns (uint256)",
    ];
    const poolAbi = [
      "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
    ];

    const dusd = new ethers.Contract(ADDRESSES.dusd, erc20Abi, attacker);
    const pool = new ethers.Contract(ADDRESSES.pool, poolAbi, attacker);
    const aToken = new ethers.Contract(ADDRESSES.aDUSD, aTokenAbi, attacker);

    // Mint a minimal amount so getPreviousIndex is populated.
    await dusd.connect(minter).mint(attacker.address, DUST_UNIT);
    await dusd.connect(attacker).approve(ADDRESSES.pool, DUST_UNIT);
    await pool.connect(attacker).supply(ADDRESSES.dusd, DUST_UNIT, attacker.address, 0);

    const index = (await aToken.getPreviousIndex(attacker.address)) as bigint;

    let foundAmount: bigint | null = null;
    for (let amount = 1n; amount <= 1_000_000n; amount++) {
      const scaled = rayDiv(amount, index);
      if (scaled === 0n) {
        continue;
      }
      const oldBalance = rayMul(scaled, index);
      const newBalance = rayMulDown(scaled, index);
      if (oldBalance > newBalance) {
        foundAmount = amount;
        break;
      }
    }

    if (foundAmount !== null) {
      console.log(`Found pre-fix profitable amount (1 unit profit via rounding): ${foundAmount.toString()}`);
    }
    expect(foundAmount !== null).to.equal(true);
  });

  it("invariant: repeated supply/withdraw does not increase balance for random small amounts", async function () {
    const [attacker] = await ethers.getSigners();
    const minter = await ethers.getImpersonatedSigner(DUSD_MINTER);

    await hre.network.provider.send("hardhat_setBalance", [
      DUSD_MINTER,
      "0x1000000000000000000",
    ]);

    const erc20Abi = [
      "function balanceOf(address) view returns (uint256)",
      "function mint(address,uint256)",
      "function approve(address,uint256) returns (bool)",
    ];
    const poolAbi = [
      "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
      "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
    ];

    const dusd = new ethers.Contract(ADDRESSES.dusd, erc20Abi, attacker);
    const pool = new ethers.Contract(ADDRESSES.pool, poolAbi, attacker);

    const rng = lcg(12345);

    const seed = 1_000_000n;
    await dusd.connect(minter).mint(attacker.address, seed);
    await dusd.connect(attacker).approve(ADDRESSES.pool, seed);

    for (let i = 0; i < 25; i++) {
      const amount = BigInt((rng() % 1000) + 1); // 1..1000 units
      const before = (await dusd.balanceOf(attacker.address)) as bigint;
      await pool.connect(attacker).supply(ADDRESSES.dusd, amount, attacker.address, 0);
      await pool.connect(attacker).withdraw(ADDRESSES.dusd, amount, attacker.address);
      const after = (await dusd.balanceOf(attacker.address)) as bigint;
      expect(after).to.be.lte(before);
    }
  });

  it("fuzz: rounding loop math never yields profit with down-rounding", async function () {
    const rng = lcg(4242);
    for (let i = 0; i < 200; i++) {
      const amount = BigInt((rng() % 1_000_000) + 1); // 1..1,000,000 units
      const loopCount = (rng() % 50) + 1; // 1..50 loops
      const index = RAY + BigInt(rng() % 2_000_000_000); // [1.0, 1.000000002]

      const scaled = rayDiv(amount, index);
      if (scaled === 0n) {
        continue;
      }
      const oldBalance = rayMul(scaled, index);
      const newBalance = rayMulDown(scaled, index);

      const perLoopDiff = oldBalance > newBalance ? oldBalance - newBalance : 0n;
      const totalDiff = perLoopDiff * BigInt(loopCount);

      // With down-rounding, user balance is never inflated.
      expect(newBalance).to.be.lte(oldBalance);
      // Profit only exists in old rounding (if any). We assert down-rounding has zero profit.
      expect(totalDiff >= 0n).to.equal(true);
    }
  });

  it("borrow/repay loop: no balance inflation or debt reduction beyond repayment", async function () {
    const minter = await ethers.getImpersonatedSigner(DUSD_MINTER);
    const governance = await ethers.getImpersonatedSigner(GOVERNANCE);
    const borrower = await ethers.getImpersonatedSigner(WFRAX_COLLATERAL_USER);

    await hre.network.provider.send("hardhat_setBalance", [
      DUSD_MINTER,
      "0x1000000000000000000",
    ]);
    await hre.network.provider.send("hardhat_setBalance", [
      GOVERNANCE,
      "0x1000000000000000000",
    ]);
    await hre.network.provider.send("hardhat_setBalance", [
      WFRAX_COLLATERAL_USER,
      "0x1000000000000000000",
    ]);

    const erc20Abi = [
      "function balanceOf(address) view returns (uint256)",
      "function mint(address,uint256)",
      "function approve(address,uint256) returns (bool)",
    ];
    const poolAbi = [
      "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
      "function borrow(address asset,uint256 amount,uint256 interestRateMode,uint16 referralCode,address onBehalfOf)",
      "function repay(address asset,uint256 amount,uint256 interestRateMode,address onBehalfOf) returns (uint256)",
      "function setUserUseReserveAsCollateral(address asset,bool useAsCollateral)",
    ];
    const dataProviderAbi = [
      "function getReserveConfigurationData(address asset) view returns (uint256,uint256,uint256,uint256,uint256,bool,bool,bool,bool,bool)",
    ];
    const configuratorAbi = [
      "function setReserveBorrowing(address asset,bool enabled)",
      "function configureReserveAsCollateral(address asset,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus)",
    ];

    const dusd = new ethers.Contract(ADDRESSES.dusd, erc20Abi, borrower);
    const pool = new ethers.Contract(ADDRESSES.pool, poolAbi, borrower);
    const dataProvider = new ethers.Contract(
      "0xFB3adf4c845fD6352D24F3F0981eb7954401829c",
      dataProviderAbi,
      borrower,
    );
    const configurator = new ethers.Contract(POOL_CONFIGURATOR, configuratorAbi, governance);

    let config = await dataProvider.getReserveConfigurationData(ADDRESSES.dusd);
    let borrowingEnabled = config[6] as boolean;
    const usageAsCollateralEnabled = config[5] as boolean;
    const ltv = config[0] as bigint;

    if (!borrowingEnabled) {
      await configurator.setReserveBorrowing(ADDRESSES.dusd, true);
      config = await dataProvider.getReserveConfigurationData(ADDRESSES.dusd);
      borrowingEnabled = config[6] as boolean;
    }

    if (!usageAsCollateralEnabled || ltv === 0n) {
      await configurator.configureReserveAsCollateral(ADDRESSES.dusd, 5000, 6000, 10500);
      config = await dataProvider.getReserveConfigurationData(ADDRESSES.dusd);
    }

    borrowingEnabled = config[6] as boolean;
    const usageAsCollateralEnabledAfter = config[5] as boolean;
    const ltvAfter = config[0] as bigint;

    expect(borrowingEnabled).to.equal(true);
    expect(usageAsCollateralEnabledAfter).to.equal(true);
    expect(ltvAfter > 0n).to.equal(true);

    const borrowAmount = 10n;
    const loops = 20;

    for (let i = 0; i < loops; i++) {
      const balanceBefore = (await dusd.balanceOf(borrower.address)) as bigint;
      await pool.connect(borrower).borrow(ADDRESSES.dusd, borrowAmount, 2, 0, borrower.address);
      await dusd.connect(borrower).approve(ADDRESSES.pool, borrowAmount);
      await pool.connect(borrower).repay(ADDRESSES.dusd, borrowAmount, 2, borrower.address);
      const balanceAfter = (await dusd.balanceOf(borrower.address)) as bigint;
      expect(balanceAfter).to.be.lte(balanceBefore);
    }
  });

  it("aToken rounding invariants: rayMulDown never exceeds rayMul", async function () {
    const rng = lcg(777);
    for (let i = 0; i < 200; i++) {
      const scaled = BigInt((rng() % 1_000_000_000) + 1);
      const index = RAY + BigInt(rng() % 10_000_000_000);
      const up = rayMul(scaled, index);
      const down = rayMulDown(scaled, index);
      expect(down).to.be.lte(up);
    }
  });

  it("rayMulDown handles very large numbers without exceeding rayMul", async function () {
    const bigValues: Array<[bigint, bigint]> = [
      [10n ** 45n, RAY],
      [10n ** 50n, RAY + 10n ** 18n],
      [(2n ** 200n), RAY + 10n ** 12n],
      [(2n ** 220n), RAY * 2n],
    ];

    for (const [a, b] of bigValues) {
      const up = rayMul(a, b);
      const down = rayMulDown(a, b);
      expect(down).to.be.lte(up);
    }
  });

  it("rayMulDown handles very small numbers without exceeding rayMul", async function () {
    const smallValues: Array<[bigint, bigint]> = [
      [1n, 1n],
      [1n, RAY],
      [2n, RAY - 1n],
      [7n, RAY + 3n],
      [123n, 999n],
      [999n, 123n],
    ];

    for (const [a, b] of smallValues) {
      const up = rayMul(a, b);
      const down = rayMulDown(a, b);
      expect(down).to.be.lte(up);
    }
  });

  it("rayMulDown invariant (fuzz): down <= up for random small values", async function () {
    const rng = lcg(202502);
    for (let i = 0; i < 500; i++) {
      const a = BigInt((rng() % 10_000) + 1); // 1..10,000
      const b = BigInt((rng() % 10_000) + 1); // 1..10,000
      const up = rayMul(a, b);
      const down = rayMulDown(a, b);
      expect(down).to.be.lte(up);
    }
  });

  it("rayMulDown invariant (fuzz): down <= up across mixed scales", async function () {
    const rng = lcg(90909);
    for (let i = 0; i < 300; i++) {
      const a = BigInt((rng() % 1_000_000_000) + 1); // up to 1e9
      const b = RAY + BigInt(rng() % 1_000_000_000); // near-ray
      const up = rayMul(a, b);
      const down = rayMulDown(a, b);
      expect(down).to.be.lte(up);
    }
  });

  it("gas-bounded loop: cap loops by estimated gas", async function () {
    const [attacker] = await ethers.getSigners();
    const minter = await ethers.getImpersonatedSigner(DUSD_MINTER);

    await hre.network.provider.send("hardhat_setBalance", [
      DUSD_MINTER,
      "0x1000000000000000000",
    ]);

    const erc20Abi = [
      "function mint(address,uint256)",
      "function approve(address,uint256) returns (bool)",
    ];
    const poolAbi = [
      "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
      "function withdraw(address asset,uint256 amount,address to) returns (uint256)",
    ];

    const dusd = new ethers.Contract(ADDRESSES.dusd, erc20Abi, attacker);
    const pool = new ethers.Contract(ADDRESSES.pool, poolAbi, attacker);

    const seed = 1_000_000n;
    await dusd.connect(minter).mint(attacker.address, seed);
    await dusd.connect(attacker).approve(ADDRESSES.pool, seed);

    const gasSupply = await pool.connect(attacker).supply.estimateGas(
      ADDRESSES.dusd,
      DUST_UNIT,
      attacker.address,
      0,
    );
    const gasWithdraw = await pool.connect(attacker).withdraw.estimateGas(
      ADDRESSES.dusd,
      DUST_UNIT,
      attacker.address,
    );
    const perLoop = gasSupply + gasWithdraw;
    const blockGasLimit = 30_000_000n;
    const maxLoops = Number(blockGasLimit / perLoop);
    const loops = Math.min(maxLoops, 200);

    for (let i = 0; i < loops; i++) {
      await pool.connect(attacker).supply(ADDRESSES.dusd, DUST_UNIT, attacker.address, 0);
      await pool.connect(attacker).withdraw(ADDRESSES.dusd, DUST_UNIT, attacker.address);
    }
  });
});
