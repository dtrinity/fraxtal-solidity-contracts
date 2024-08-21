import BigNumber from "bignumber.js";
import { expect } from "chai";
import { solidityPacked } from "ethers";
import hre from "hardhat";

import {
  DSwapRepayAdapter,
  // eslint-disable-next-line camelcase -- This is a generated typechain import
  DSwapRepayAdapter__factory,
} from "../../../typechain-types";
import { standardDEXLBPLiquidityFixture } from "../../ecosystem/fixtures";
import { loadTestEnv } from "../../ecosystem/test-env";
import { depositCollateralWithApproval } from "../../ecosystem/utils.lbp";
import { tEthereumAddress } from "./types";
import { parseUnitsFromToken } from "./utils";

let dswapRepayAdapter: DSwapRepayAdapter;

const setupDSwapAdapter = async (): Promise<DSwapRepayAdapter> => {
  await standardDEXLBPLiquidityFixture();
  const { lendingDeployer, addressesProvider, swapRouter } =
    await loadTestEnv();
  console.log("swapRouter", swapRouter.address);
  return await deployDSwapRepayAdapter(
    await addressesProvider.getAddress(),
    swapRouter.address,
    lendingDeployer,
  );
};

describe("DSwapRepayAdapter", () => {
  beforeEach(async () => {
    dswapRepayAdapter = await setupDSwapAdapter();
    const { users, fxs } = await loadTestEnv();
    const userAddress = users[0].address;

    // Make a deposit for user
    const fxsAmount = await parseUnitsFromToken(await fxs.getAddress(), "1000");
    await fxs.mint(userAddress, fxsAmount);
    await depositCollateralWithApproval(
      userAddress,
      await fxs.getAddress(),
      1000,
    );
  });

  describe("swapAndRepay", () => {
    it("should correctly swap tokens and repay debt", async () => {
      const {
        dexDeployer,
        pool,
        fxs,
        aFXS,
        oracle,
        dusd,
        swapPoolFee,
        helpersContract,
      } = await loadTestEnv();
      const user = await hre.ethers.getSigner(dexDeployer);
      const userAddress = user.address;
      const amountFxsToSwap = await parseUnitsFromToken(
        await fxs.getAddress(),
        "10",
      );
      const fxsDecimals = Number(await fxs.decimals());
      const dusdPrice = await oracle.getAssetPrice(await dusd.getAddress());
      const fxsPrice = await oracle.getAssetPrice(await fxs.getAddress());
      const amountDusdToRepay = await parseUnitsFromToken(
        await dusd.getAddress(),
        new BigNumber(amountFxsToSwap.toString())
          .times(fxsPrice.toString())
          .div(dusdPrice.toString())
          .shiftedBy(-fxsDecimals)
          .toFixed(0),
      );

      // Open user Debt
      await pool
        .connect(user)
        .borrow(await dusd.getAddress(), amountDusdToRepay, 2, 0, userAddress);
      const dusdVariableDebtTokenAddress = (
        await helpersContract.getReserveTokensAddresses(await dusd.getAddress())
      ).variableDebtTokenAddress;
      const dusdVariableDebtContract = await hre.ethers.getContractAt(
        "VariableDebtToken",
        dusdVariableDebtTokenAddress,
      );
      const userDusdVariableDebtAmountBefore =
        await dusdVariableDebtContract.balanceOf(userAddress);
      const liquidityToSwap = (amountFxsToSwap * 105n) / 100n;
      console.log("liquidityToSwap", liquidityToSwap);

      const userAFxsBalanceBefore = await aFXS.balanceOf(userAddress);
      await aFXS
        .connect(user)
        .approve(await dswapRepayAdapter.getAddress(), liquidityToSwap);

      const path = solidityPacked(
        ["address", "uint24", "address"],
        [await dusd.getAddress(), swapPoolFee, await fxs.getAddress()],
      );

      await dswapRepayAdapter
        .connect(user)
        .swapAndRepay(
          await fxs.getAddress(),
          await dusd.getAddress(),
          liquidityToSwap,
          amountDusdToRepay,
          2,
          0,
          path,
          {
            amount: 0,
            deadline: 0,
            v: 0,
            r: "0x0000000000000000000000000000000000000000000000000000000000000000",
            s: "0x0000000000000000000000000000000000000000000000000000000000000000",
          },
        );
      const adapterFxsBalance = await fxs.balanceOf(
        await dswapRepayAdapter.getAddress(),
      );
      const adapterDusdBalance = await dusd.balanceOf(
        await dswapRepayAdapter.getAddress(),
      );
      const userDusdVariableDebtAmount =
        await dusdVariableDebtContract.balanceOf(userAddress);
      const userAFxsBalance = await aFXS.balanceOf(userAddress);
      expect(adapterFxsBalance).to.be.eq("0");
      expect(adapterDusdBalance).to.be.eq("0");
      expect(userDusdVariableDebtAmountBefore).to.be.gte(amountDusdToRepay);
      expect(userDusdVariableDebtAmount).to.be.lt(amountDusdToRepay);
      expect(userAFxsBalance).to.be.lt(userAFxsBalanceBefore);
      expect(userAFxsBalance).to.be.gte(
        userAFxsBalanceBefore - liquidityToSwap,
      );
    });
  });
});

/**
 * Deploy the DSwapRepayAdapter contract
 *
 * @param poolAddressesProvider The Pool Addresses Provider contract address
 * @param routerAddress The Swap Router contract address
 * @param owner The deployer address
 * @returns The DSwapRepayAdapter instance
 */
async function deployDSwapRepayAdapter(
  poolAddressesProvider: tEthereumAddress,
  routerAddress: tEthereumAddress,
  owner: tEthereumAddress,
): Promise<DSwapRepayAdapter> {
  const signer = await hre.ethers.getSigner(owner);
  return await new DSwapRepayAdapter__factory(signer).deploy(
    poolAddressesProvider,
    routerAddress,
    owner,
  );
}
