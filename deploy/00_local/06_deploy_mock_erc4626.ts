import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployContract } from "../../utils/deploy";
import { isLocalNetwork } from "../../utils/utils";

/**
 * Deploy a new ERC4626 token
 *
 * @param hre - Hardhat runtime environment
 * @param underlyingAssetAddress - The address of the underlying asset
 * @param deployer - The address of the deployer
 * @returns The address and symbol of the deployed ERC4626 token
 */
async function deployERC4626Token(
  hre: HardhatRuntimeEnvironment,
  underlyingAssetAddress: string,
  deployer: string,
): Promise<{
  vaultTokenAddress: string;
  vaultTokenSymbol: string;
}> {
  const underlyingTokenContract = await hre.ethers.getContractAt(
    "@openzeppelin/contracts-5/token/ERC20/ERC20.sol:ERC20",
    underlyingAssetAddress,
    await hre.ethers.getSigner(deployer),
  );

  const underlyingTokenSymbol = await underlyingTokenContract.symbol();

  const vaultTokenSymbol = `v${underlyingTokenSymbol}`;
  await deployContract(
    hre,
    vaultTokenSymbol,
    [
      underlyingAssetAddress, // asset_
      `${underlyingTokenSymbol} Vault Token`, // name_
      vaultTokenSymbol, // symbol_
    ],
    undefined, // auto-filling gas limit
    await hre.ethers.getSigner(deployer),
    undefined, // no libraries
    "contracts/token/MockERC4626Token.sol:MockERC4626Token",
  );

  const { address: vaultTokenAddress } = await hre.deployments.get(vaultTokenSymbol);

  if (!vaultTokenAddress) {
    throw new Error(`Vault token address for ${underlyingTokenSymbol} is not found`);
  }

  return {
    vaultTokenAddress,
    vaultTokenSymbol,
  };
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (!isLocalNetwork(hre.network.name)) {
    console.log("This script is only for localhost and hardhat network");
    return false;
  }

  const { dexDeployer } = await hre.getNamedAccounts();
  // List of assets to create ERC4626 vaults for
  const assetSymbols = ["SFRAX"];

  // Deploy ERC4626 vault tokens for each asset
  for (const assetSymbol of assetSymbols) {
    // Get the underlying asset address
    const { address: underlyingAssetAddress } = await hre.deployments.get(assetSymbol);

    // Deploy the ERC4626 vault token
    await deployERC4626Token(hre, underlyingAssetAddress, dexDeployer);
  }

  // Return true to indicate the success of the deployment
  // It is to avoid running this script again (except using --reset flag)
  return true;
};

func.id = "DeployMockERC4626";
func.tags = ["mock", "mock-erc4626"];
export default func;
