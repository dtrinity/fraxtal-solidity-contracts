import { ethers } from "ethers";
import hre from "hardhat";

import { ONE_BPS_UNIT } from "../../../utils/constants";
import { fetchTokenInfo } from "../../../utils/token";
import { getDLoopVaultUniswapV3DeploymentName } from "../../../utils/vault/dloop.utils";

/**
 *
 * To run this script, run the following command:
 *    yarn hardhat run --network <network> scripts/dex/quote_swap.ts
 */
async function main(): Promise<void> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(dexDeployer);

  const underlyingTokenInfo = await fetchTokenInfo(hre, "0x0Dbf64462FEC588df32FC5C9941421F7d93e0Fb3");

  // const dLOOPUniswapV3Address = "0x4CF0A91e8467dcC259De9aD424adBB5f366Bf370";
  // const dLOOPUniswapV3Address = "0xC20291214862C29B974E1A37e19234CaCC600b09";
  const { address: dLOOPUniswapV3Address } = await hre.deployments.get(
    getDLoopVaultUniswapV3DeploymentName(underlyingTokenInfo.symbol, 30000 * ONE_BPS_UNIT),
  );

  console.log("dLOOPUniswapV3Address: ", dLOOPUniswapV3Address);

  const dLOOPUniswapV3Contract = await hre.ethers.getContractAt("DLoopVaultUniswapV3", dLOOPUniswapV3Address, signer);

  console.log("Fetched the underlying token info");

  // Approve the contract to spend the underlying token
  const underlyingTokenContract = await hre.ethers.getContractAt(
    "contracts/dex/universal_router/test/MintableERC20.sol:MintableERC20",
    underlyingTokenInfo.address,
    signer,
  );
  let res;

  await underlyingTokenContract.approve(dLOOPUniswapV3Address, ethers.parseUnits("100", 18));

  console.log("Approved the contract to spend the underlying token");
  console.log("Underlying token balance before deposit: ", await underlyingTokenContract.balanceOf(signer.address));

  // Deposit the 1st time
  res = await dLOOPUniswapV3Contract.deposit(ethers.parseUnits("1", 18), signer.address);

  console.log("Depositing 1st: ", res.hash);
  await res.wait();
  console.log("Deposit successful");

  // Check current leverage bps
  let leverageBps = await dLOOPUniswapV3Contract.getCurrentLeverageBps();
  console.log("Current leverage bps: ", leverageBps.toString());

  // Deposit the 2nd time
  res = await dLOOPUniswapV3Contract.deposit(ethers.parseUnits("1", 18), signer.address);

  console.log("Depositing 2nd: ", res.hash);
  await res.wait();
  console.log("Deposit successful");

  // Check current leverage bps
  leverageBps = await dLOOPUniswapV3Contract.getCurrentLeverageBps();
  console.log("Current leverage bps: ", leverageBps.toString());

  // First withdrawal with be successful
  res = await dLOOPUniswapV3Contract.withdrawWith(
    ethers.parseUnits("0.1", 18),
    signer.address,
    signer.address,
    await dLOOPUniswapV3Contract.getDefaultSwapSlippageTolerance(),
    0,
    await dLOOPUniswapV3Contract.DEFAULT_UNDERLYING_TO_DUSD_SWAP_PATH(),
  );
  console.log("Withdrawing: ", res.hash);
  await res.wait();
  console.log("Withdraw successful");

  // Check current leverage bps
  leverageBps = await dLOOPUniswapV3Contract.getCurrentLeverageBps();
  console.log("Current leverage bps: ", leverageBps.toString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
