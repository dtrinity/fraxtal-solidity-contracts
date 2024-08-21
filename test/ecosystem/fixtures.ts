import { FeeAmount } from "@uniswap/v3-sdk";
import { deployments, getNamedAccounts } from "hardhat";
import { DeploymentsExtension } from "hardhat-deploy/types";

import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { getStaticOraclePrice } from "../../utils/dex/oracle";
import { increaseTime } from "./utils.chain";
import {
  createPoolAddLiquidityWithApproval,
  swapExactInputSingleWithApproval,
  useMockStaticOracleWrapper,
} from "./utils.dex";
import { depositCollateralWithApproval } from "./utils.lbp";
import { getTokenContractForSymbol } from "./utils.token";

export const freshFixture = deployments.createFixture(
  async ({ deployments }) => {
    await deployments.fixture(["mock", "dex", "lbp"]); // Mimic a testnet deployment
  },
);

export const standardDEXLBPLiquidityFixture = deployments.createFixture(
  async ({ deployments }) => {
    await standardDEXLBPLiquidityFixtureImplementation(deployments);
  },
);

export const standardDEXLBPLiquidityWithMockOracleFixture =
  deployments.createFixture(async ({ deployments }) => {
    await standardDEXLBPLiquidityFixtureImplementation(deployments);

    const { dexDeployer } = await getNamedAccounts();
    const { tokenInfo: dusdInfo } = await getTokenContractForSymbol(
      dexDeployer,
      "DUSD",
    );

    // Use MockStaticOracleWrapper to mock the price
    await useMockStaticOracleWrapper(
      dusdInfo.address,
      AAVE_ORACLE_USD_DECIMALS,
    );
  });

/**
 * Standard DEX/LBP liquidity fixture implementation
 * - It can be used as part of a fixture
 *
 * @param deployments - Hardhat deployments
 */
async function standardDEXLBPLiquidityFixtureImplementation(
  deployments: DeploymentsExtension,
): Promise<void> {
  await deployments.fixture(); // Start from a fresh deployment to avoid side-effects from other fixtures
  await deployments.fixture(["mock", "dex", "lbp", "liquidator-bot"]); // Mimic a testnet deployment
  const { dexDeployer } = await getNamedAccounts();

  /*
   * Get shared token info
   */
  const { tokenInfo: dusdInfo } = await getTokenContractForSymbol(
    dexDeployer,
    "DUSD",
  );

  const { tokenInfo: sfraxInfo } = await getTokenContractForSymbol(
    dexDeployer,
    "SFRAX",
  );

  const { tokenInfo: sfrxethInfo } = await getTokenContractForSymbol(
    dexDeployer,
    "SFRXETH",
  );

  const { tokenInfo: fxsInfo } = await getTokenContractForSymbol(
    dexDeployer,
    "FXS",
  );

  /*
   * Set up DEX infra
   */

  // Create DUSD/SFRAX pool with SFRAX = 1.25 DUSD
  await createPoolAddLiquidityWithApproval(
    dexDeployer,
    FeeAmount.HIGH,
    dusdInfo.address,
    sfraxInfo.address,
    100_000,
    80_000,
    6000,
  );

  // Create DUSD/SFRXETH pool with SFRXETH = 4000 DUSD
  await createPoolAddLiquidityWithApproval(
    dexDeployer,
    FeeAmount.HIGH,
    dusdInfo.address,
    sfrxethInfo.address,
    40_000,
    10,
    6000,
  );

  // Create DUSD/FXS pool with FXS = 4 DUSD
  await createPoolAddLiquidityWithApproval(
    dexDeployer,
    FeeAmount.HIGH,
    dusdInfo.address,
    fxsInfo.address,
    40_000,
    10_000,
    6000,
  );

  // Warm up the pools by making some swaps

  for (let i = 0; i < 1; i++) {
    // SFRAX
    await swapExactInputSingleWithApproval(
      dexDeployer,
      FeeAmount.HIGH,
      dusdInfo.address,
      sfraxInfo.address,
      1,
      6000,
    );
    // SFRXETH
    await swapExactInputSingleWithApproval(
      dexDeployer,
      FeeAmount.HIGH,
      dusdInfo.address,
      sfrxethInfo.address,
      1,
      6000,
    );
    // FXS
    await swapExactInputSingleWithApproval(
      dexDeployer,
      FeeAmount.HIGH,
      dusdInfo.address,
      fxsInfo.address,
      1,
      6000,
    );
    await increaseTime(60);
  }
  const sfraxPrice = await getStaticOraclePrice(dexDeployer, sfraxInfo.address);
  console.log("Warmed up sFRAX price: ", sfraxPrice.toString());
  const sfrxethPrice = await getStaticOraclePrice(
    dexDeployer,
    sfrxethInfo.address,
  );
  console.log("Warmed up sFRXETH price: ", sfrxethPrice.toString());
  const fxsPrice = await getStaticOraclePrice(dexDeployer, fxsInfo.address);
  console.log("Warmed up FXS price: ", fxsPrice.toString());

  /*
   * Set up LBP infra
   */

  // Deposit 100k DUSD for borrowing
  await depositCollateralWithApproval(dexDeployer, dusdInfo.address, 100_000);

  // Deposit 10k FXS for borrowing
  await depositCollateralWithApproval(dexDeployer, fxsInfo.address, 10_000);

  // We don't deposit other assets since we don't expect users to deposit them without borrowing other assets
}
