import BigNumber from "bignumber.js";
import { expect } from "chai";
import { solidityPacked } from "ethers";
import hre from "hardhat";

import {
  DSwapWithdrawSwapAdapter,
  // eslint-disable-next-line camelcase -- This is a generated typechain import
  DSwapWithdrawSwapAdapter__factory,
} from "../../../typechain-types";
import { standardUniswapV3DEXLBPLiquidityFixture } from "../../ecosystem/fixtures";
import { loadTestEnv } from "../../ecosystem/test-env";
import { depositCollateralWithApproval } from "../../ecosystem/utils.lbp";
import { tEthereumAddress } from "./types";
import { parseUnitsFromToken } from "./utils";

const setupDSwapAdapter = async (): Promise<DSwapWithdrawSwapAdapter> => {
  await standardUniswapV3DEXLBPLiquidityFixture();
  const { lendingDeployer, addressesProvider, swapRouter } = await loadTestEnv();
  return await deployDSwapWithdrawSwapAdapter(await addressesProvider.getAddress(), swapRouter.address, lendingDeployer);
};

let dswapWithdrawSwapAdapter: DSwapWithdrawSwapAdapter;

describe("DSwapWithdrawSwapAdapter", () => {
  describe("withdrawAndSwap", () => {
    beforeEach(async () => {
      dswapWithdrawSwapAdapter = await setupDSwapAdapter();
      const { users, sfrax } = await loadTestEnv();
      const userAddress = users[0].address;
      // Make a deposit for user
      const sfraxAmount = await parseUnitsFromToken(await sfrax.getAddress(), "100");
      await sfrax.mint(userAddress, sfraxAmount);
      await depositCollateralWithApproval(userAddress, await sfrax.getAddress(), 100);
    });

    it("should correctly withdraw and swap", async () => {
      const { users, sfrax, oracle, dusd, aSFRAX, fxs, swapPoolFee } = await loadTestEnv();
      const user = users[0];
      const userAddress = user.address;

      const amountToSwap = await parseUnitsFromToken(await sfrax.getAddress(), "10");

      const sfraxPrice = await oracle.getAssetPrice(await sfrax.getAddress());
      const fxsPrice = await oracle.getAssetPrice(await fxs.getAddress());
      const fxsDecimals = Number(await fxs.decimals());
      const minimumFxsAmountToRecieve = await parseUnitsFromToken(
        await fxs.getAddress(),
        new BigNumber(amountToSwap.toString())
          .times(sfraxPrice.toString())
          .times(0.95) // 5% slippage
          .div(fxsPrice.toString())
          .shiftedBy(-fxsDecimals)
          .toFixed(0),
      );

      const userFxsBalanceBefore = await fxs.balanceOf(userAddress);
      const userASFRAXBalanceBefore = await aSFRAX.balanceOf(userAddress);
      await aSFRAX.connect(user).approve(await dswapWithdrawSwapAdapter.getAddress(), amountToSwap);

      const path = solidityPacked(
        ["address", "uint24", "address", "uint24", "address"],
        [await sfrax.getAddress(), swapPoolFee, await dusd.getAddress(), swapPoolFee, await fxs.getAddress()],
      );

      await expect(
        dswapWithdrawSwapAdapter
          .connect(user)
          .withdrawAndSwap(await sfrax.getAddress(), await fxs.getAddress(), amountToSwap, minimumFxsAmountToRecieve, 0, path, {
            amount: 0,
            deadline: 0,
            v: 0,
            r: "0x0000000000000000000000000000000000000000000000000000000000000000",
            s: "0x0000000000000000000000000000000000000000000000000000000000000000",
          }),
      )
        .to.emit(dswapWithdrawSwapAdapter, "Swapped")
        .withArgs(await sfrax.getAddress(), await fxs.getAddress(), amountToSwap, (value: bigint) => value >= minimumFxsAmountToRecieve);

      const adapterSfraxBalance = await sfrax.balanceOf(await dswapWithdrawSwapAdapter.getAddress());
      const adapterFxsBalance = await fxs.balanceOf(await dswapWithdrawSwapAdapter.getAddress());
      const userFxsBalance = await fxs.balanceOf(userAddress);
      const userASFRAXBalance = await aSFRAX.balanceOf(userAddress);

      expect(adapterSfraxBalance).to.be.eq("0");
      expect(adapterFxsBalance).to.be.eq("0");
      expect(userFxsBalance - userFxsBalanceBefore).to.be.greaterThanOrEqual(minimumFxsAmountToRecieve);
      expect(userASFRAXBalance).to.be.eq(userASFRAXBalanceBefore - amountToSwap);
    });
  });
});

/**
 * Deploy DSwapWithdrawSwapAdapter contract
 *
 * @param poolAddressesProvider The pool addresses provider
 * @param router The swap router address
 * @param owner The deployer address
 * @returns The DSwapWithdrawSwapAdapter instance
 */
async function deployDSwapWithdrawSwapAdapter(
  poolAddressesProvider: tEthereumAddress,
  router: tEthereumAddress,
  owner: tEthereumAddress,
): Promise<DSwapWithdrawSwapAdapter> {
  const signer = await hre.ethers.getSigner(owner);
  return await new DSwapWithdrawSwapAdapter__factory(signer).deploy(poolAddressesProvider, router, owner);
}
