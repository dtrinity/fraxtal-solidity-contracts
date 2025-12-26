import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("DLoopCoreDLend – Reward Compounding (vault shares as exchange asset)", function () {
  let treasury: SignerWithAddress;
  let user: SignerWithAddress;
  let rewardSource: SignerWithAddress;

  let Collateral: any;
  let Debt: any;
  let RewardToken: any;
  let collateral: any;
  let debt: any;
  let rewardToken1: any;
  let rewardToken2: any;

  let PriceOracle: any;
  let AddressesProvider: any;
  let RewardsController: any;
  let priceOracle: any;
  let addressesProvider: any;
  let rewardsController: any;

  let DLoopCoreDLendHarness: any;
  let dloop: any;

  const MAX_TREASURY_FEE_BPS = 300_000n;
  const INIT_TREASURY_FEE_BPS = 100_000n;
  const EXCHANGE_THRESHOLD = ethers.parseEther("1");
  const TARGET_LEVERAGE_BPS = 3_000_000n;
  const LOWER_BPS = 2_500_000n;
  const UPPER_BPS = 3_500_000n;

  beforeEach(async function () {
    [, treasury, user, rewardSource] = await ethers.getSigners();

    Collateral = await ethers.getContractFactory("TestMintableERC20");
    Debt = await ethers.getContractFactory("TestMintableERC20");
    RewardToken = await ethers.getContractFactory("TestMintableERC20");

    collateral = await Collateral.deploy("Collateral", "COLL", 18);
    debt = await Debt.deploy("Debt", "DEBT", 18);
    rewardToken1 = await RewardToken.deploy("Reward1", "R1", 18);
    rewardToken2 = await RewardToken.deploy("Reward2", "R2", 18);

    PriceOracle = await ethers.getContractFactory("MockPriceOracleGetter");
    priceOracle = await PriceOracle.deploy();
    await priceOracle.setPrice(await collateral.getAddress(), 2_000_00000000n);
    await priceOracle.setPrice(await debt.getAddress(), 1_000_00000000n);

    AddressesProvider = await ethers.getContractFactory("MockPoolAddressesProvider");
    addressesProvider = await AddressesProvider.deploy(ethers.ZeroAddress, await priceOracle.getAddress());

    RewardsController = await ethers.getContractFactory("MockRewardsController");
    rewardsController = await RewardsController.deploy(await rewardSource.getAddress());

    DLoopCoreDLendHarness = await ethers.getContractFactory("DLoopCoreDLendHarness");
    dloop = await DLoopCoreDLendHarness.deploy(
      "DLend Vault",
      "DLV",
      await collateral.getAddress(),
      await debt.getAddress(),
      await addressesProvider.getAddress(),
      TARGET_LEVERAGE_BPS,
      LOWER_BPS,
      UPPER_BPS,
      0,
      0,
      0,
      await rewardsController.getAddress(),
      await collateral.getAddress(),
      ethers.ZeroAddress,
      await treasury.getAddress(),
      MAX_TREASURY_FEE_BPS,
      INIT_TREASURY_FEE_BPS,
      EXCHANGE_THRESHOLD,
    );

    await rewardToken1.mint(await rewardSource.getAddress(), ethers.parseEther("1000000"));
    await rewardToken2.mint(await rewardSource.getAddress(), ethers.parseEther("1000000"));

    await rewardsController.setEmission(await rewardToken1.getAddress(), ethers.parseEther("3"));
    await rewardsController.setEmission(await rewardToken2.getAddress(), ethers.parseEther("2"));

    await rewardToken1.connect(rewardSource).approve(await rewardsController.getAddress(), ethers.parseEther("1000000"));
    await rewardToken2.connect(rewardSource).approve(await rewardsController.getAddress(), ethers.parseEther("1000000"));
  });

  it("Should burn shares and distribute rewards with treasury fee on compound", async function () {
    const amountToCompound = ethers.parseEther("10");

    const receiver = user.address;
    const tokens = [await rewardToken1.getAddress(), await rewardToken2.getAddress()];

    await dloop.mintShares(await user.getAddress(), amountToCompound);
    await dloop.connect(user).approve(await dloop.getAddress(), amountToCompound);

    const totalSupplyBefore: bigint = await dloop.totalSupply();
    const treasuryBalR1Before: bigint = await rewardToken1.balanceOf(await treasury.getAddress());
    const treasuryBalR2Before: bigint = await rewardToken2.balanceOf(await treasury.getAddress());
    const recvBalR1Before: bigint = await rewardToken1.balanceOf(receiver);
    const recvBalR2Before: bigint = await rewardToken2.balanceOf(receiver);

    const tx = await dloop.connect(user).compoundRewards(amountToCompound, tokens, receiver);
    await tx.wait();

    const totalSupplyAfter: bigint = await dloop.totalSupply();
    expect(totalSupplyAfter).to.equal(totalSupplyBefore - amountToCompound);

    const DENOM_BPS = 1_000_000n;
    const emittedFee1 = (ethers.parseEther("3") * INIT_TREASURY_FEE_BPS) / DENOM_BPS;
    const emittedFee2 = (ethers.parseEther("2") * INIT_TREASURY_FEE_BPS) / DENOM_BPS;

    const treasuryBalR1After: bigint = await rewardToken1.balanceOf(await treasury.getAddress());
    const treasuryBalR2After: bigint = await rewardToken2.balanceOf(await treasury.getAddress());
    expect(treasuryBalR1After - treasuryBalR1Before).to.equal(emittedFee1);
    expect(treasuryBalR2After - treasuryBalR2Before).to.equal(emittedFee2);

    const recvBalR1After: bigint = await rewardToken1.balanceOf(receiver);
    const recvBalR2After: bigint = await rewardToken2.balanceOf(receiver);
    expect(recvBalR1After - recvBalR1Before).to.equal(ethers.parseEther("3") - emittedFee1);
    expect(recvBalR2After - recvBalR2Before).to.equal(ethers.parseEther("2") - emittedFee2);
  });

  it("Should enforce threshold on amount", async function () {
    const below = EXCHANGE_THRESHOLD - 1n;

    await dloop.mintShares(await user.getAddress(), below);
    await dloop.connect(user).approve(await dloop.getAddress(), below);

    await expect(dloop.connect(user).compoundRewards(below, [await rewardToken1.getAddress()], user.address)).to.be.revertedWithCustomError(
      dloop,
      "ExchangeAmountTooLow",
    );
  });

  it("compounding uses share burn, not debt repay", async function () {
    const amount = ethers.parseEther("5");

    await dloop.mintShares(await user.getAddress(), amount);
    await dloop.connect(user).approve(await dloop.getAddress(), amount);

    const debtBalBefore: bigint = await debt.balanceOf(await dloop.getAddress());
    const debtAllowBefore: bigint = await debt.allowance(await dloop.getAddress(), await dloop.getAddress());

    await dloop.connect(user).compoundRewards(amount, [await rewardToken1.getAddress()], user.address);

    const debtBalAfter: bigint = await debt.balanceOf(await dloop.getAddress());
    const debtAllowAfter: bigint = await debt.allowance(await dloop.getAddress(), await dloop.getAddress());

    expect(debtBalAfter).to.equal(debtBalBefore);
    expect(debtAllowAfter).to.equal(debtAllowBefore);
  });
});
