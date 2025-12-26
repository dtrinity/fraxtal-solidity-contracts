import { expect } from "chai";
import { ethers } from "hardhat";

describe("DLoopCoreDLend simple test", () => {
  it("should be able to get the vault name", async () => {
    const [admin] = await ethers.getSigners();
    const MockERC20 = await ethers.getContractFactory("TestMintableERC20");
    const collateral = await MockERC20.deploy("sfrxUSD", "sfrxUSD", 18);
    const debt = await MockERC20.deploy("dUSD", "dUSD", 18);

    const MockPool = await ethers.getContractFactory("contracts/mocks/MockPool.sol:MockPool");
    const pool = await MockPool.deploy();

    const PriceOracle = await ethers.getContractFactory("MockPriceOracleGetter");
    const priceOracle = await PriceOracle.deploy();
    await priceOracle.setPrice(await collateral.getAddress(), 1_00000000n);
    await priceOracle.setPrice(await debt.getAddress(), 1_00000000n);

    const AddressesProvider = await ethers.getContractFactory("MockPoolAddressesProvider");
    const addressesProvider = await AddressesProvider.deploy(await pool.getAddress(), await priceOracle.getAddress());

    const DLoopCoreDLendHarness = await ethers.getContractFactory("DLoopCoreDLendHarness");
    const vault = await DLoopCoreDLendHarness.deploy(
      "DLend Vault",
      "DLV",
      await collateral.getAddress(),
      await debt.getAddress(),
      await addressesProvider.getAddress(),
      3_000_000,
      2_500_000,
      3_500_000,
      0,
      0,
      0,
      ethers.ZeroAddress,
      await collateral.getAddress(),
      ethers.ZeroAddress,
      await admin.getAddress(),
      300_000,
      100_000,
      ethers.parseEther("1"),
    );

    const name = await vault.name();
    expect(name).to.be.a("string");
  });
});
