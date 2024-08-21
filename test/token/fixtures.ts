import hre from "hardhat";

import { deployContract } from "../../utils/deploy";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";

export const standardTestTokenFixture = hre.deployments.createFixture(
  async ({ deployments }) => {
    await deployments.fixture(); // Start from a fresh deployment to avoid side-effects from other fixtures
    await deployments.fixture(["test-token-mint"]); // Mimic a testnet deployment

    const { testTokenDeployer } = await hre.getNamedAccounts();

    const { tokenInfo: receiptInfo } = await getTokenContractForSymbol(
      testTokenDeployer,
      "DUSD",
    );

    const { tokenInfo: collateralInfo } = await getTokenContractForSymbol(
      testTokenDeployer,
      "SFRAX",
    );

    const tokenSupplyManagerDeployment = await deployContract(
      hre,
      "TokenSupplyManager",
      [collateralInfo.address, receiptInfo.address],
      undefined, // auto-filling gas limit
      await hre.ethers.getSigner(testTokenDeployer),
      undefined, // no libraries
      "TokenSupplyManager",
    );

    // For testing private functions of TokenSupplyManager
    await deployContract(
      hre,
      "TokenSupplyManagerHarness",
      [collateralInfo.address, receiptInfo.address],
      undefined, // auto-filling gas limit
      await hre.ethers.getSigner(testTokenDeployer),
      undefined, // no libraries
      "TokenSupplyManagerHarness",
    );

    // Make the TokenSupplyManager the minter for the receipt token
    const receiptContract = await hre.ethers.getContractAt(
      "ERC20StablecoinUpgradeable",
      receiptInfo.address,
      await hre.ethers.getSigner(testTokenDeployer),
    );

    await receiptContract.grantRole(
      await receiptContract.MINTER_ROLE(),
      tokenSupplyManagerDeployment.address,
    );
  },
);
