import { HardhatRuntimeEnvironment } from "hardhat/types";

import { deployContract } from "../../../utils/deploy";
import { UNIV3_AMO_VAULT_ID } from "../../../utils/deploy-ids";

/**
 * Deploys a Uniswap V3 AMO Vault contract.
 *
 * @param hre - The Hardhat Runtime Environment.
 * @param dusdAddress - The address of the dUSD token contract.
 * @param amoManagerAddress - The address of the dUSD AMO manager contract.
 * @param oracleAddress - The address of the price oracle contract.
 * @param poolAddress - The address of the UniswapV3Pool contract.
 * @param positionManagerAddress - The address of the Uniswap V3 NonfungiblePositionManager contract.
 * @param routerAddress - The address of the Uniswap V3 SwapRouter contract.
 * @param adminAddress - The address of the admin account.
 * @param collateralWithdrawerAddress - The address of the account that can withdraw collateral.
 * @param recovererAddress - The address of the account that can recover funds.
 * @param amoTraderAddress - The address of the account that can trade AMO positions.
 * @returns A boolean indicating whether the deployment was successful.
 */
export default async function deployUniswapV3AmoVault(
  hre: HardhatRuntimeEnvironment,
  dusdAddress: string,
  amoManagerAddress: string,
  oracleAddress: string,
  poolAddress: string,
  positionManagerAddress: string,
  routerAddress: string,
  adminAddress: string,
  collateralWithdrawerAddress: string,
  recovererAddress: string,
  amoTraderAddress: string,
): Promise<boolean> {
  const deployer = await hre.ethers.getSigner(adminAddress);
  await deployContract(
    hre,
    UNIV3_AMO_VAULT_ID,
    [
      dusdAddress,
      amoManagerAddress,
      oracleAddress,
      poolAddress,
      positionManagerAddress,
      routerAddress,
      adminAddress,
      collateralWithdrawerAddress,
      recovererAddress,
      amoTraderAddress,
    ],
    undefined, // auto-filled gas limit
    deployer,
  );

  return true;
}
