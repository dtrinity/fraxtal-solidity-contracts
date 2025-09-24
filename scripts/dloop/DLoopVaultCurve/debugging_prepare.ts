import { ethers } from "ethers";
import hre from "hardhat";

import { getConfig } from "../../../config/config";
import { ONE_BPS_UNIT } from "../../../utils/constants";
import { fetchTokenInfo } from "../../../utils/token";
import { getDLoopVaultCurveDeploymentName } from "../../../utils/vault/dloop.utils";

/**
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/dex/quote_swap.ts
 */
async function main(): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(dexDeployer);

  const config = await getConfig(hre);

  const underlyingTokenInfo = await fetchTokenInfo(hre, config.dLoopCurve?.vaults[0].underlyingAssetAddress as string);

  // const DLoopVaultCurve = "0x4CF0A91e8467dcC259De9aD424adBB5f366Bf370";
  // const DLoopVaultCurve = "0xC20291214862C29B974E1A37e19234CaCC600b09";
  const { address: DLoopVaultCurve } = await hre.deployments.get(
    getDLoopVaultCurveDeploymentName(underlyingTokenInfo.symbol, 30000 * ONE_BPS_UNIT),
  );

  console.log("DLoopVaultCurve: ", DLoopVaultCurve);

  const dLOOPCurve = await hre.ethers.getContractAt("DLoopVaultCurve", DLoopVaultCurve, signer);

  console.log("Fetched the underlying token info");

  // Approve the contract to spend the underlying token
  const underlyingTokenContract = await hre.ethers.getContractAt(
    "contracts/dex/universal_router/test/MintableERC20.sol:MintableERC20",
    underlyingTokenInfo.address,
    signer,
  );
  let res;
  let leverageBps;

  await underlyingTokenContract.approve(DLoopVaultCurve, ethers.parseUnits("100", 18));

  console.log("Approved the contract to spend the underlying token");
  console.log("Underlying token balance before deposit: ", await underlyingTokenContract.balanceOf(signer.address));
  console.log("");

  const balanceBeforeDeposit1 = await underlyingTokenContract.balanceOf(signer.address);
  const shareBalanceBeforeDeposit1 = await dLOOPCurve.balanceOf(signer.address);

  // Deposit the 1st time
  res = await dLOOPCurve.deposit(ethers.parseUnits("1", 18), signer.address);

  console.log("Depositing 1st: ", res.hash);
  await res.wait();
  console.log("Deposit successful");

  const balanceAfterDeposit1 = await underlyingTokenContract.balanceOf(signer.address);
  console.log(`Deposited amount: ${balanceAfterDeposit1 - balanceBeforeDeposit1}`);
  const shareBalanceAfterDeposit1 = await dLOOPCurve.balanceOf(signer.address);
  console.log(`Share received: ${shareBalanceAfterDeposit1 - shareBalanceBeforeDeposit1}`);

  // Check current leverage bps
  leverageBps = await dLOOPCurve.getCurrentLeverageBps();
  console.log("Current leverage bps: ", leverageBps.toString());
  console.log("");

  const balanceBeforeDeposit2 = await underlyingTokenContract.balanceOf(signer.address);
  const shareBalanceBeforeDeposit2 = await dLOOPCurve.balanceOf(signer.address);

  // Deposit the 2nd time
  res = await dLOOPCurve.deposit(ethers.parseUnits("1", 18), signer.address);

  console.log("Depositing 2nd: ", res.hash);
  await res.wait();
  console.log("Deposit successful");

  const balanceAfterDeposit2 = await underlyingTokenContract.balanceOf(signer.address);
  console.log(`Deposited amount: ${balanceAfterDeposit2 - balanceBeforeDeposit2}`);
  const shareBalanceAfterDeposit2 = await dLOOPCurve.balanceOf(signer.address);
  console.log(`Share received: ${shareBalanceAfterDeposit2 - shareBalanceBeforeDeposit2}`);

  // Check current leverage bps
  leverageBps = await dLOOPCurve.getCurrentLeverageBps();
  console.log("Current leverage bps: ", leverageBps.toString());
  console.log("");

  const balanceBeforeWithdraw = await underlyingTokenContract.balanceOf(signer.address);
  const shareBalanceBeforeWithdraw = await dLOOPCurve.balanceOf(signer.address);

  // First withdrawal with be successful
  console.log("Withdrawing: ", res.hash);
  res = await dLOOPCurve.withdraw(ethers.parseUnits("0.1", 18), signer.address, signer.address);
  await res.wait();
  console.log("Withdraw successful");

  const balanceAfterWithdraw = await underlyingTokenContract.balanceOf(signer.address);
  console.log(`Withdrawn amount: ${balanceAfterWithdraw - balanceBeforeWithdraw}`);
  const shareBalanceAfterWithdraw = await dLOOPCurve.balanceOf(signer.address);
  console.log(`Share burned: ${shareBalanceBeforeWithdraw - shareBalanceAfterWithdraw}`);

  // Check current leverage bps
  leverageBps = await dLOOPCurve.getCurrentLeverageBps();
  console.log("Current leverage bps: ", leverageBps.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
