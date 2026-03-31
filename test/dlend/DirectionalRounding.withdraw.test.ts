import { FeeAmount } from "@uniswap/v3-sdk";
import { expect } from "chai";
import hre, { deployments, ethers, getNamedAccounts } from "hardhat";

import { getPoolContractAddress } from "../../utils/lending/pool";
import { increaseTime } from "../ecosystem/utils.chain";
import { createPoolAddLiquidityWithApproval, swapExactInputSingleWithApproval, TEST_DEADLINE_SECONDS } from "../ecosystem/utils.dex";
import { borrowAsset, depositCollateralWithApproval } from "../ecosystem/utils.lbp";
import { getATokenForSymbol, getTokenContractForSymbol, transferTokenToAccount } from "../ecosystem/utils.token";

const RAY = 10n ** 27n;

function rayMulFloor(amount: bigint, index: bigint): bigint {
  return (amount * index) / RAY;
}

const directionalRoundingWithdrawFixture = deployments.createFixture(async ({ deployments }) => {
  await deployments.fixture(["mock", "dex", "oracle-aggregator", "lbp", "liquidator-bot"]);

  const { dexDeployer, testAccount1 } = await getNamedAccounts();

  const { tokenInfo: dusdInfo, contract: dusd } = await getTokenContractForSymbol(dexDeployer, "dUSD");
  const { tokenInfo: sfraxInfo } = await getTokenContractForSymbol(dexDeployer, "SFRAX");
  const { tokenInfo: sfrxethInfo } = await getTokenContractForSymbol(dexDeployer, "SFRXETH");
  const { tokenInfo: fxsInfo } = await getTokenContractForSymbol(dexDeployer, "FXS");

  await createPoolAddLiquidityWithApproval(
    dexDeployer,
    FeeAmount.HIGH,
    dusdInfo.address,
    sfraxInfo.address,
    100_000,
    80_000,
    TEST_DEADLINE_SECONDS,
  );
  await createPoolAddLiquidityWithApproval(
    dexDeployer,
    FeeAmount.HIGH,
    dusdInfo.address,
    sfrxethInfo.address,
    40_000,
    10,
    TEST_DEADLINE_SECONDS,
  );
  await createPoolAddLiquidityWithApproval(
    dexDeployer,
    FeeAmount.HIGH,
    dusdInfo.address,
    fxsInfo.address,
    40_000,
    10_000,
    TEST_DEADLINE_SECONDS,
  );

  await swapExactInputSingleWithApproval(dexDeployer, FeeAmount.HIGH, dusdInfo.address, sfraxInfo.address, 1, TEST_DEADLINE_SECONDS);
  await swapExactInputSingleWithApproval(dexDeployer, FeeAmount.HIGH, dusdInfo.address, sfrxethInfo.address, 1, TEST_DEADLINE_SECONDS);
  await swapExactInputSingleWithApproval(dexDeployer, FeeAmount.HIGH, dusdInfo.address, fxsInfo.address, 1, TEST_DEADLINE_SECONDS);
  await increaseTime(60);

  await depositCollateralWithApproval(dexDeployer, dusdInfo.address, 100_000);
  await depositCollateralWithApproval(dexDeployer, fxsInfo.address, 10_000);

  const pool = await hre.ethers.getContractAt("Pool", await getPoolContractAddress());
  const aToken = await getATokenForSymbol(testAccount1, "dUSD");

  return { pool, aToken, dusd, sfraxInfo, dexDeployer, testAccount1 };
});

describe("dLEND directional rounding withdraw flow", function () {
  it("floors withdraw(max) to the scaled balance on the real pool path", async function () {
    const { pool, aToken, dusd, sfraxInfo, dexDeployer, testAccount1 } = await directionalRoundingWithdrawFixture();
    const user = await ethers.getSigner(testAccount1);
    const deployer = await ethers.getSigner(dexDeployer);
    const amount = 18n;

    await transferTokenToAccount(dexDeployer, testAccount1, "SFRAX", 100_000);
    await depositCollateralWithApproval(testAccount1, sfraxInfo.address, 100_000);
    await borrowAsset(testAccount1, await dusd.getAddress(), 50_000);

    await increaseTime(365 * 24 * 60 * 60);
    await (await dusd.connect(deployer).approve(await pool.getAddress(), 1_000_000n)).wait();
    await (await pool.connect(deployer).supply(await dusd.getAddress(), 1_000_000n, dexDeployer, 0)).wait();

    const reserveData = await pool.getReserveData(await dusd.getAddress());
    const liquidityIndex = BigInt(reserveData.liquidityIndex.toString());
    expect(liquidityIndex).to.be.gt(RAY);

    await (await dusd.connect(deployer).transfer(testAccount1, amount)).wait();
    await (await dusd.connect(user).approve(await pool.getAddress(), amount)).wait();

    const walletBalanceBeforeSupply = await dusd.balanceOf(testAccount1);
    await (await pool.connect(user).supply(await dusd.getAddress(), amount, testAccount1, 0)).wait();

    const scaledBalanceAfterSupply = await aToken.scaledBalanceOf(testAccount1);
    const expectedWithdrawAmount = rayMulFloor(BigInt(scaledBalanceAfterSupply.toString()), liquidityIndex);

    expect(scaledBalanceAfterSupply).to.equal(17n);
    expect(await aToken.balanceOf(testAccount1)).to.equal(expectedWithdrawAmount);

    const walletBalanceBeforeWithdraw = await dusd.balanceOf(testAccount1);
    await (await pool.connect(user).withdraw(await dusd.getAddress(), ethers.MaxUint256, testAccount1)).wait();
    const walletBalanceAfterWithdraw = await dusd.balanceOf(testAccount1);

    expect(walletBalanceAfterWithdraw - walletBalanceBeforeWithdraw).to.equal(expectedWithdrawAmount);
    expect(walletBalanceAfterWithdraw).to.equal(walletBalanceBeforeSupply - amount + expectedWithdrawAmount);
    expect(await aToken.scaledBalanceOf(testAccount1)).to.equal(0n);
    expect(await aToken.balanceOf(testAccount1)).to.equal(0n);
  });
});
