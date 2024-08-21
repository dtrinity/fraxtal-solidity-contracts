import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../../utils/deploy";
import {
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_DATA_PROVIDER_ID,
  TREASURY_PROXY_ID,
} from "../../../../utils/lending/deploy-ids";
import {
  configureReservesByHelper,
  initReservesByHelper,
} from "../../../../utils/lending/init-helper";
import { savePoolTokens } from "../../../../utils/lending/market-config-helpers";
import { IInterestRateStrategyParams, IReserveParams } from "../../types";

/**
 * Initialize the Reserves
 * - Reference: https://github.com/aave/aave-v3-deploy/blob/27ccc6d24ef767a2b71946784a843526edbc9618/deploy/02_market/09_init_reserves.ts
 *
 * @param hre - Hardhat Runtime Environment
 * @param deployer - The deployer signer
 * @param reservesAddresses - The reserve token addresses
 * @param rateStrategies - The rate strategies
 * @param reservesConfig - The reserves configuration
 * @returns True if the deployment is successful, false otherwise
 */
export async function initReserves(
  hre: HardhatRuntimeEnvironment,
  deployer: HardhatEthersSigner,
  reservesAddresses: {
    [symbol: string]: string;
  },
  rateStrategies: IInterestRateStrategyParams[],
  reservesConfig: { [symbol: string]: IReserveParams },
): Promise<boolean> {
  const addressProviderDeployedResult = await hre.deployments.get(
    POOL_ADDRESSES_PROVIDER_ID,
  );

  // Deploy Rate Strategies
  for (const strategy in rateStrategies) {
    const strategyData = rateStrategies[strategy];
    const args = [
      addressProviderDeployedResult.address,
      strategyData.optimalUsageRatio,
      strategyData.baseVariableBorrowRate,
      strategyData.variableRateSlope1,
      strategyData.variableRateSlope2,
      strategyData.stableRateSlope1,
      strategyData.stableRateSlope2,
      strategyData.baseStableRateOffset,
      strategyData.stableRateExcessOffset,
      strategyData.optimalStableToTotalDebtRatio,
    ];
    await deployContract(
      hre,
      `ReserveStrategy-${strategyData.name}`,
      args,
      undefined, // auto-filled gas limit
      deployer,
      undefined, // no library
      "DefaultReserveInterestRateStrategy",
    );
  }

  // Deploy Reserves ATokens
  const { address: treasuryAddress } =
    await hre.deployments.get(TREASURY_PROXY_ID);

  if (Object.keys(reservesAddresses).length == 0) {
    console.warn("[WARNING] Skipping initialization. Empty asset list.");
    // Return true to indicate the script has run successfully
    // and avoid running it again (except using --reset flag)
    return true;
  }

  await initReservesByHelper(
    hre,
    reservesConfig,
    reservesAddresses,
    deployer,
    treasuryAddress,
  );
  console.log(`[Deployment] Initialized all reserves`);

  await configureReservesByHelper(
    hre,
    deployer,
    reservesConfig,
    reservesAddresses,
  );

  // Save AToken and Debt tokens artifacts
  const dataProvider = await hre.deployments.get(POOL_DATA_PROVIDER_ID);
  await savePoolTokens(hre, reservesAddresses, dataProvider.address);

  console.log(`[Deployment] Configured all reserves`);

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
}
