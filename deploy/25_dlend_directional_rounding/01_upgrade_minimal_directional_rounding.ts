import { SafeTransactionData } from "@dtrinity/shared-hardhat-tools";
import { ZeroAddress } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { getConfig } from "../../config/config";
import { GovernanceExecutor } from "../../typescript/hardhat/governance";
import {
  DIRECTIONAL_ROUNDING_ATOKEN_IMPL_ID,
  DIRECTIONAL_ROUNDING_POOL_IMPL_ID,
  DIRECTIONAL_ROUNDING_TOKEN_INIT_PARAMS,
  DIRECTIONAL_ROUNDING_UPGRADE_TAG,
  DIRECTIONAL_ROUNDING_VARIABLE_DEBT_TOKEN_IMPL_ID,
  readProxyImplementation,
  resolveDirectionalRoundingReserves,
} from "../../utils/lending/directional-rounding-upgrade";
import { POOL_ADDRESSES_PROVIDER_ID, POOL_CONFIGURATOR_PROXY_ID, POOL_PROXY_ID } from "../../utils/lending/deploy-ids";
import { getReserveTokenAddresses } from "../../utils/lending/token";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(lendingDeployer);
  const config = await getConfig(hre);
  const executor = new GovernanceExecutor(hre, deployer, config.safeConfig);
  await executor.initialize();

  const reserveAssetAddresses = await getReserveTokenAddresses(hre);
  const targetReserves = resolveDirectionalRoundingReserves(reserveAssetAddresses);

  const { address: addressesProviderAddress } = await hre.deployments.get(POOL_ADDRESSES_PROVIDER_ID);
  const { address: configuratorAddress } = await hre.deployments.get(POOL_CONFIGURATOR_PROXY_ID);
  const { address: newPoolImplementation } = await hre.deployments.get(DIRECTIONAL_ROUNDING_POOL_IMPL_ID);
  const { address: newATokenImplementation } = await hre.deployments.get(DIRECTIONAL_ROUNDING_ATOKEN_IMPL_ID);
  const { address: newVariableDebtImplementation } = await hre.deployments.get(DIRECTIONAL_ROUNDING_VARIABLE_DEBT_TOKEN_IMPL_ID);

  const addressesProvider = await hre.ethers.getContractAt("PoolAddressesProvider", addressesProviderAddress, deployer);
  const configurator = await hre.ethers.getContractAt("PoolConfigurator", configuratorAddress, deployer);
  const pool = await hre.ethers.getContractAt("Pool", await addressesProvider.getPool(), deployer);
  const aclManager = await hre.ethers.getContractAt("ACLManager", await addressesProvider.getACLManager(), deployer);

  const hasPoolAdminRole = await aclManager.isPoolAdmin(deployer.address);
  const addressesProviderOwner = await addressesProvider.owner();

  let allComplete = true;

  const currentPoolImplementation = await readProxyImplementation(hre.ethers.provider, await pool.getAddress());
  if (currentPoolImplementation.toLowerCase() === newPoolImplementation.toLowerCase()) {
    console.log(`✓ Pool proxy already points to directional rounding implementation ${newPoolImplementation}`);
  } else {
    const setPoolImplementationTx = (): SafeTransactionData => ({
      to: addressesProviderAddress,
      value: "0",
      data: addressesProvider.interface.encodeFunctionData("setPoolImpl", [newPoolImplementation]),
    });

    const poolUpgradeComplete = await executor.tryOrQueue(
      async () => {
        if (addressesProviderOwner.toLowerCase() !== deployer.address.toLowerCase()) {
          throw new Error(`deployer is not PoolAddressesProvider owner (${addressesProviderOwner})`);
        }

        await (await addressesProvider.setPoolImpl(newPoolImplementation)).wait();
        console.log(`  ➕ Upgraded Pool proxy to ${newPoolImplementation}`);
      },
      setPoolImplementationTx,
    );

    if (!poolUpgradeComplete) {
      allComplete = false;
    }
  }

  for (const reserve of targetReserves) {
    const reserveData = await pool.getReserveData(reserve.asset);

    if (reserveData.aTokenAddress === ZeroAddress || reserveData.variableDebtTokenAddress === ZeroAddress) {
      throw new Error(`Reserve ${reserve.symbol} is not initialized in dLEND`);
    }

    const aToken = await hre.ethers.getContractAt("AToken", reserveData.aTokenAddress, deployer);
    const variableDebtToken = await hre.ethers.getContractAt("VariableDebtToken", reserveData.variableDebtTokenAddress, deployer);

    const currentATokenImplementation = await readProxyImplementation(hre.ethers.provider, reserveData.aTokenAddress);
    if (currentATokenImplementation.toLowerCase() === newATokenImplementation.toLowerCase()) {
      console.log(`✓ ${reserve.symbol} aToken already points to directional rounding implementation ${newATokenImplementation}`);
    } else {
      const aTokenUpdateInput = {
        asset: reserve.asset,
        treasury: await aToken.RESERVE_TREASURY_ADDRESS(),
        incentivesController: await aToken.getIncentivesController(),
        name: await aToken.name(),
        symbol: await aToken.symbol(),
        implementation: newATokenImplementation,
        params: DIRECTIONAL_ROUNDING_TOKEN_INIT_PARAMS,
      };

      const updateATokenTx = (): SafeTransactionData => ({
        to: configuratorAddress,
        value: "0",
        data: configurator.interface.encodeFunctionData("updateAToken", [aTokenUpdateInput]),
      });

      const aTokenUpgradeComplete = await executor.tryOrQueue(
        async () => {
          if (!hasPoolAdminRole) {
            throw new Error("deployer lacks POOL_ADMIN role");
          }

          await (await configurator.updateAToken(aTokenUpdateInput)).wait();
          console.log(`  ➕ Upgraded ${reserve.symbol} aToken to ${newATokenImplementation}`);
        },
        updateATokenTx,
      );

      if (!aTokenUpgradeComplete) {
        allComplete = false;
      }
    }

    const currentVariableDebtImplementation = await readProxyImplementation(hre.ethers.provider, reserveData.variableDebtTokenAddress);
    if (currentVariableDebtImplementation.toLowerCase() === newVariableDebtImplementation.toLowerCase()) {
      console.log(
        `✓ ${reserve.symbol} variable debt token already points to directional rounding implementation ${newVariableDebtImplementation}`,
      );
      continue;
    }

    const variableDebtUpdateInput = {
      asset: reserve.asset,
      incentivesController: await variableDebtToken.getIncentivesController(),
      name: await variableDebtToken.name(),
      symbol: await variableDebtToken.symbol(),
      implementation: newVariableDebtImplementation,
      params: DIRECTIONAL_ROUNDING_TOKEN_INIT_PARAMS,
    };

    const updateVariableDebtTokenTx = (): SafeTransactionData => ({
      to: configuratorAddress,
      value: "0",
      data: configurator.interface.encodeFunctionData("updateVariableDebtToken", [variableDebtUpdateInput]),
    });

    const variableDebtUpgradeComplete = await executor.tryOrQueue(
      async () => {
        if (!hasPoolAdminRole) {
          throw new Error("deployer lacks POOL_ADMIN role");
        }

        await (await configurator.updateVariableDebtToken(variableDebtUpdateInput)).wait();
        console.log(`  ➕ Upgraded ${reserve.symbol} variable debt token to ${newVariableDebtImplementation}`);
      },
      updateVariableDebtTokenTx,
    );

    if (!variableDebtUpgradeComplete) {
      allComplete = false;
    }
  }

  if (!allComplete) {
    await executor.flush(
      `dLEND minimal directional rounding upgrade: Pool + reserve token implementations for ${targetReserves.map((reserve) => reserve.symbol).join(", ")}`,
    );
    console.log("\n⏳ Some directional rounding upgrade operations require governance signatures.");
    console.log("   Re-run the script after the Safe batch is executed to finalize.");
    console.log(`\n≻ ${__filename.split("/").slice(-2).join("/")}: pending governance ⏳`);
    return false;
  }

  return true;
};

func.id = "dlend:minimal-directional-rounding:upgrade";
func.tags = [DIRECTIONAL_ROUNDING_UPGRADE_TAG, `${DIRECTIONAL_ROUNDING_UPGRADE_TAG}-upgrade`];
func.dependencies = [
  POOL_ADDRESSES_PROVIDER_ID,
  POOL_PROXY_ID,
  POOL_CONFIGURATOR_PROXY_ID,
  DIRECTIONAL_ROUNDING_POOL_IMPL_ID,
  DIRECTIONAL_ROUNDING_ATOKEN_IMPL_ID,
  DIRECTIONAL_ROUNDING_VARIABLE_DEBT_TOKEN_IMPL_ID,
];

export default func;
