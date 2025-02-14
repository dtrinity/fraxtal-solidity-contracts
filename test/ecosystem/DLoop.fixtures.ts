import hre, { deployments } from "hardhat";

import { getConfig } from "../../config/config";
import { checkIfSwapPathExists } from "../../utils/dex/pool";
import {
  standardCurveDEXLBPLiquidityFixtureImplementation,
  standardCurveDEXLBPLiquidityWithMockOracleFixtureImplementation,
  standardMockCurveDEXLBPLiquidityWithMockOracleFixtureImplementation,
  standardUniswapV3DEXLBPLiquidityFixtureImplementation,
  standardUniswapV3DEXLBPLiquidityWithMockOracleFixtureImplementation,
} from "./fixtures";

export const standardDLoopUniswapV3WithMockOracleFixture =
  deployments.createFixture(async ({ deployments }) => {
    await standardUniswapV3DEXLBPLiquidityWithMockOracleFixtureImplementation(
      deployments,
      ["dloop"],
    );

    const config = await getConfig(hre);

    if (!config.dLoopUniswapV3) {
      throw new Error("The dLoopUniswapV3 configuration is not available");
    }

    if (config.dLoopUniswapV3.vaults.length === 0) {
      throw new Error("No vaults are configured");
    }

    // Make sure the swap path exists for all vaults
    for (const vaultConfig of config.dLoopUniswapV3.vaults) {
      // Make sure the swap path exists
      await checkIfSwapPathExists(
        vaultConfig.defaultDusdToUnderlyingSwapPath.tokenAddressesPath,
        vaultConfig.defaultDusdToUnderlyingSwapPath.poolFeeSchemaPath,
      );
      await checkIfSwapPathExists(
        vaultConfig.defaultUnderlyingToDusdSwapPath.tokenAddressesPath,
        vaultConfig.defaultUnderlyingToDusdSwapPath.poolFeeSchemaPath,
      );
    }
  });

export const standardDLoopUniswapV3Fixture = deployments.createFixture(
  async ({ deployments }) => {
    await standardUniswapV3DEXLBPLiquidityFixtureImplementation(deployments, [
      "dloop",
    ]);

    const config = await getConfig(hre);

    if (!config.dLoopUniswapV3) {
      throw new Error("The dLoopUniswapV3 configuration is not available");
    }

    if (config.dLoopUniswapV3.vaults.length === 0) {
      throw new Error("No vaults are configured");
    }

    // Make sure the swap path exists for all vaults
    for (const vaultConfig of config.dLoopUniswapV3.vaults) {
      // Make sure the swap path exists
      await checkIfSwapPathExists(
        vaultConfig.defaultDusdToUnderlyingSwapPath.tokenAddressesPath,
        vaultConfig.defaultDusdToUnderlyingSwapPath.poolFeeSchemaPath,
      );
      await checkIfSwapPathExists(
        vaultConfig.defaultUnderlyingToDusdSwapPath.tokenAddressesPath,
        vaultConfig.defaultUnderlyingToDusdSwapPath.poolFeeSchemaPath,
      );
    }
  },
);

export const standardDLoopCurveWithMockOracleFixture =
  deployments.createFixture(async ({ deployments }) => {
    await standardCurveDEXLBPLiquidityWithMockOracleFixtureImplementation(
      deployments,
      ["dloop"],
    );

    const config = await getConfig(hre);

    if (!config.dLoopCurve) {
      throw new Error("The dLoopCurve configuration is not available");
    }

    if (config.dLoopCurve.vaults.length === 0) {
      throw new Error("No vaults are configured");
    }
  });

export const standardDLoopCurveFixture = deployments.createFixture(
  async ({ deployments }) => {
    await standardCurveDEXLBPLiquidityFixtureImplementation(deployments, [
      "dloop",
    ]);

    const config = await getConfig(hre);

    if (!config.dLoopCurve) {
      throw new Error("The dLoopCurve configuration is not available");
    }

    if (config.dLoopCurve.vaults.length === 0) {
      throw new Error("No vaults are configured");
    }
  },
);

export const standardDLoopMockCurveWithMockOracleFixture =
  deployments.createFixture(async ({ deployments }) => {
    await standardMockCurveDEXLBPLiquidityWithMockOracleFixtureImplementation(
      deployments,
      ["dloop"],
    );
  });
