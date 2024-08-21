import BigNumber from "bignumber.js";
import { expect } from "chai";
import { solidityPacked } from "ethers";
import hre from "hardhat";

import {
  DSwapLiquiditySwapAdapter,
  // eslint-disable-next-line camelcase -- This is a generated typechain import
  DSwapLiquiditySwapAdapter__factory,
} from "../../../typechain-types";
import { standardDEXLBPLiquidityFixture } from "../../ecosystem/fixtures";
import { loadTestEnv } from "../../ecosystem/test-env";
import { depositCollateralWithApproval } from "../../ecosystem/utils.lbp";
import { tEthereumAddress } from "./types";
import { parseUnitsFromToken } from "./utils";

let dswapLiquiditySwapAdapter: DSwapLiquiditySwapAdapter;

const setupDSwapAdapter = async (): Promise<DSwapLiquiditySwapAdapter> => {
  await standardDEXLBPLiquidityFixture();
  const { lendingDeployer, addressesProvider, swapRouter } =
    await loadTestEnv();
  return await deployDSwapLiquiditySwapAdapter(
    await addressesProvider.getAddress(),
    swapRouter.address,
    lendingDeployer,
  );
};

describe("DSwapLiquiditySwapAdapter", () => {
  beforeEach(async () => {
    dswapLiquiditySwapAdapter = await setupDSwapAdapter();
    const { users, sfrax, lendingDeployer } = await loadTestEnv();
    const userAddress = users[0].address;
    let sfraxAmount = await parseUnitsFromToken(
      await sfrax.getAddress(),
      "100",
    );
    await sfrax.mint(lendingDeployer, sfraxAmount);
    await depositCollateralWithApproval(
      lendingDeployer,
      await sfrax.getAddress(),
      100,
    );

    // Make a deposit for user
    sfraxAmount = await parseUnitsFromToken(await sfrax.getAddress(), "1000");
    await sfrax.mint(userAddress, sfraxAmount);
    await depositCollateralWithApproval(
      userAddress,
      await sfrax.getAddress(),
      1000,
    );
  });

  describe("swapAndDeposit", () => {
    it("should correctly swap tokens and deposit the out tokens in the pool", async () => {
      const {
        users,
        sfrax,
        oracle,
        fxs,
        aFXS,
        aSFRAX,
        swapPoolFee,
        dusd,
        pool,
      } = await loadTestEnv();
      const user = users[0];
      const userAddress = users[0].address;
      // Open user Debt
      const debtAmount = await parseUnitsFromToken(
        await dusd.getAddress(),
        "1",
      );
      await pool
        .connect(user)
        .borrow(await dusd.getAddress(), debtAmount, 2, 0, userAddress);

      const amountToSwap = await parseUnitsFromToken(
        await sfrax.getAddress(),
        "11",
      );

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

      // User will swap liquidity aSFRAX to aFXS
      const userASFRAXBalanceBefore = await aSFRAX.balanceOf(userAddress);
      await aSFRAX
        .connect(user)
        .approve(await dswapLiquiditySwapAdapter.getAddress(), amountToSwap);

      const path = solidityPacked(
        ["address", "uint24", "address", "uint24", "address"],
        [
          await sfrax.getAddress(),
          swapPoolFee,
          await dusd.getAddress(),
          swapPoolFee,
          await fxs.getAddress(),
        ],
      );
      await expect(
        dswapLiquiditySwapAdapter
          .connect(user)
          .swapAndDeposit(
            await sfrax.getAddress(),
            await fxs.getAddress(),
            amountToSwap,
            minimumFxsAmountToRecieve,
            0,
            path,
            {
              amount: 0,
              deadline: 0,
              v: 0,
              r: "0x0000000000000000000000000000000000000000000000000000000000000000",
              s: "0x0000000000000000000000000000000000000000000000000000000000000000",
            },
          ),
      )
        .to.emit(dswapLiquiditySwapAdapter, "Swapped")
        .withArgs(
          await sfrax.getAddress(),
          await fxs.getAddress(),
          amountToSwap,
          (value: bigint) => value >= minimumFxsAmountToRecieve,
        );

      const adapterSFRAXBalance = await sfrax.balanceOf(
        await dswapLiquiditySwapAdapter.getAddress(),
      );
      const adapterFXSBalance = await fxs.balanceOf(
        await dswapLiquiditySwapAdapter.getAddress(),
      );
      const userAFXSBalance = await aFXS.balanceOf(userAddress);
      const userASFRAXBalance = await aSFRAX.balanceOf(userAddress);

      expect(adapterSFRAXBalance).to.be.eq("0");
      expect(adapterFXSBalance).to.be.eq("0");
      expect(userAFXSBalance).to.be.greaterThanOrEqual(
        minimumFxsAmountToRecieve,
      );
      expect(userASFRAXBalance).to.be.eq(
        userASFRAXBalanceBefore - amountToSwap,
      );
    });
  });
});

/**
 * Deploy DSwapLiquiditySwapAdapter
 *
 * @param poolAddressesProvider address of the pool addresses provider
 * @param routerAddress address of the Swap Router contract
 * @param owner address of the depoloyer
 * @returns DSwapLiquiditySwapAdapter instance of the deployed contract
 */
async function deployDSwapLiquiditySwapAdapter(
  poolAddressesProvider: tEthereumAddress,
  routerAddress: tEthereumAddress,
  owner: tEthereumAddress,
): Promise<DSwapLiquiditySwapAdapter> {
  const signer = await hre.ethers.getSigner(owner);
  return await new DSwapLiquiditySwapAdapter__factory(signer).deploy(
    poolAddressesProvider,
    routerAddress,
    owner,
  );
}
