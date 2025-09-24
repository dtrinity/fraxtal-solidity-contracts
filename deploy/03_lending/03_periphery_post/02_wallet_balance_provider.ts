import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { deployWalletBalanceProvider } from "../../../utils/lending/deploy/03_periphery_post/02_wallet_balance_provider";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { lendingDeployer } = await hre.getNamedAccounts();

  return deployWalletBalanceProvider(hre, await hre.ethers.getSigner(lendingDeployer));
};

func.tags = ["lbp", "lbp-periphery-post", "lbp-walletProvider"];
func.id = "WalletBalanceProvider";

export default func;
