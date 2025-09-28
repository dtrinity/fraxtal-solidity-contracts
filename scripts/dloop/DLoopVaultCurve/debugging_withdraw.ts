import { ethers } from "ethers";
import hre from "hardhat";

import { getConfig } from "../../../config/config";
import { ONE_BPS_UNIT } from "../../../utils/constants";
import { getTokenContractForAddress } from "../../../utils/utils";
import { getDLoopVaultCurveDeploymentName } from "../../../utils/vault/dloop.utils";

/**
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/dex/quote_swap.ts
 */
async function main(): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(dexDeployer);

  console.log("---- Start withdrawing ----");

  const config = await getConfig(hre);

  const underlyingTokenAddress = config.dLoopCurve?.vaults[0].underlyingAssetAddress as string;

  const { tokenInfo: underlyingTokenInfo, contract: underlyingTokenContract } = await getTokenContractForAddress(
    dexDeployer,
    underlyingTokenAddress,
  );

  const { address: dLOOPCurveAddress } = await hre.deployments.get(
    getDLoopVaultCurveDeploymentName(underlyingTokenInfo.symbol, 30000 * ONE_BPS_UNIT),
  );

  console.log("dLOOPCurveAddress: ", dLOOPCurveAddress);

  const dLOOPCurve = await hre.ethers.getContractAt("DLoopVaultCurve", dLOOPCurveAddress, signer);

  console.log("Fetched the underlying token info");

  // Check current leverage bps
  const leverageBps = await dLOOPCurve.getCurrentLeverageBps();
  console.log("Current leverage bps: ", leverageBps.toString());

  const lowerBoundTargetLeverageBps = await dLOOPCurve.LOWER_BOUND_TARGET_LEVERAGE_BPS();
  const upperBoundTargetLeverageBps = await dLOOPCurve.UPPER_BOUND_TARGET_LEVERAGE_BPS();
  console.log("Lower bound target leverage bps: ", lowerBoundTargetLeverageBps.toString());
  console.log("Upper bound target leverage bps: ", upperBoundTargetLeverageBps.toString());

  const balanceBefore = await underlyingTokenContract.balanceOf(signer.address);
  const shareBalanceBefore = await dLOOPCurve.balanceOf(signer.address);

  let res = await dLOOPCurve.withdrawDebug(ethers.parseUnits("0.5", 18), signer.address, signer.address, 0);
  console.log("Withdrawing: ", res.hash);
  await res.wait();
  console.log("Withdraw successful");

  const balanceAfter = await underlyingTokenContract.balanceOf(signer.address);
  console.log("Withdrawn amount: ", (balanceAfter - balanceBefore).toString());
  const shareBalanceAfter = await dLOOPCurve.balanceOf(signer.address);
  console.log("Share burned: ", (shareBalanceAfter - shareBalanceBefore).toString());

  const balanceBeforeDeposit1 = await underlyingTokenContract.balanceOf(signer.address);
  const shareBalanceBeforeDeposit1 = await dLOOPCurve.balanceOf(signer.address);

  // Deposit the 1st time
  res = await dLOOPCurve.deposit(ethers.parseUnits("1", 18), signer.address);

  console.log("Depositing 1: ", res.hash);
  await res.wait();
  console.log("Deposit successful");

  const balanceAfterDeposit1 = await underlyingTokenContract.balanceOf(signer.address);
  console.log(`Deposited amount: ${balanceAfterDeposit1 - balanceBeforeDeposit1}`);
  const shareBalanceAfterDeposit1 = await dLOOPCurve.balanceOf(signer.address);
  console.log(`Share received: ${shareBalanceAfterDeposit1 - shareBalanceBeforeDeposit1}`);

  // Check current leverage bps
  console.log("Current leverage bps: ", (await dLOOPCurve.getCurrentLeverageBps()).toString());
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
