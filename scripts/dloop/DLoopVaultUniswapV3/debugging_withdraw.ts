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

  const underlyingTokenInfo = await fetchTokenInfo(
    hre,
    "0x0Dbf64462FEC588df32FC5C9941421F7d93e0Fb3",
  );

  // const dLOOPUniswapV3Address = "0x4CF0A91e8467dcC259De9aD424adBB5f366Bf370";
  // const dLOOPUniswapV3Address = "0xC20291214862C29B974E1A37e19234CaCC600b09";
  const { address: dLOOPUniswapV3Address } = await hre.deployments.get(
    getDLoopVaultUniswapV3DeploymentName(
      underlyingTokenInfo.symbol,
      30000 * ONE_BPS_UNIT,
    ),
  );

  console.log("dLOOPUniswapV3Address: ", dLOOPUniswapV3Address);

  const dLOOPUniswapV3Contract = await hre.ethers.getContractAt(
    "DLoopVaultUniswapV3",
    dLOOPUniswapV3Address,
    signer,
  );

  console.log("Fetched the underlying token info");

  // Check current leverage bps
  const leverageBps = await dLOOPUniswapV3Contract.getCurrentLeverageBps();
  console.log("Current leverage bps: ", leverageBps.toString());

  const lowerBoundTargetLeverageBps =
    await dLOOPUniswapV3Contract.LOWER_BOUND_TARGET_LEVERAGE_BPS();
  const upperBoundTargetLeverageBps =
    await dLOOPUniswapV3Contract.UPPER_BOUND_TARGET_LEVERAGE_BPS();
  console.log(
    "Lower bound target leverage bps: ",
    lowerBoundTargetLeverageBps.toString(),
  );
  console.log(
    "Upper bound target leverage bps: ",
    upperBoundTargetLeverageBps.toString(),
  );

  const res = await dLOOPUniswapV3Contract.withdrawWith(
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
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
