import { parseUnits, ZeroAddress } from "ethers";
import hre, { deployments } from "hardhat";

import {
  DStakeCollateralVault,
  DStakeRouterDLend,
  DStakeToken,
  MockOracleAggregator,
} from "../../../typechain-types";
import {
  ERC20_VESTING_NFT_ID,
  SDUSD_COLLATERAL_VAULT_ID,
  SDUSD_DSTAKE_TOKEN_ID,
  SDUSD_ROUTER_ID,
} from "../../../typescript/deploy-ids";
import { AAVE_ORACLE_USD_DECIMALS } from "../../../utils/constants";
import { ORACLE_AGGREGATOR_ID } from "../../../utils/oracle/deploy-ids";
import { deployTestTokens } from "../../../utils/token";
import { getTokenContractForSymbol } from "../../ecosystem/utils.token";
import { DUSD_DECIMALS, TestAmounts } from "../../utils/decimal-utils";

export const createDStakeFixture = deployments.createFixture(
  async ({ deployments, getNamedAccounts }) => {
    await deployments.fixture(); // Start fresh - this should run all deployment scripts
    // Run specific dSTAKE deployment tags to ensure everything is configured
    await deployments.fixture([
      "local-setup", // mock tokens and oracles
      "dusd", // dUSD token
      "dUSD-aTokenWrapper", // static aToken wrapper for dUSD
      "dlend", // dLend core
      "dStake", // dStake core, adapters, and configuration
    ]);

    const { dusdDeployer, testAccount1, testAccount2 } =
      await getNamedAccounts();

    // Deploy test collateral tokens for testing
    await deployTestTokens(
      hre,
      {
        FRAX: [
          {
            amount: 1e8,
            toAddress: dusdDeployer,
          },
          {
            amount: 1e6,
            toAddress: testAccount1,
          },
          {
            amount: 1e6,
            toAddress: testAccount2,
          },
        ],
        USDC: [
          {
            amount: 1e8,
            toAddress: dusdDeployer,
          },
          {
            amount: 1e6,
            toAddress: testAccount1,
          },
          {
            amount: 1e6,
            toAddress: testAccount2,
          },
        ],
      },
      await hre.ethers.getSigner(dusdDeployer),
    );

    // Get deployed contracts
    const dStakeTokenDeployment = await deployments.get(SDUSD_DSTAKE_TOKEN_ID);
    const collateralVaultDeployment = await deployments.get(
      SDUSD_COLLATERAL_VAULT_ID,
    );
    const routerDeployment = await deployments.get(SDUSD_ROUTER_ID);
    const oracleDeployment = await deployments.get(ORACLE_AGGREGATOR_ID);

    const dStakeToken = (await hre.ethers.getContractAt(
      "DStakeToken",
      dStakeTokenDeployment.address,
      await hre.ethers.getSigner(dusdDeployer),
    )) as DStakeToken;

    const collateralVault = (await hre.ethers.getContractAt(
      "DStakeCollateralVault",
      collateralVaultDeployment.address,
      await hre.ethers.getSigner(dusdDeployer),
    )) as DStakeCollateralVault;

    const router = (await hre.ethers.getContractAt(
      "DStakeRouterDLend",
      routerDeployment.address,
      await hre.ethers.getSigner(dusdDeployer),
    )) as DStakeRouterDLend;

    const oracleAggregator = await hre.ethers.getContractAt(
      "OracleAggregator",
      oracleDeployment.address,
      await hre.ethers.getSigner(dusdDeployer),
    );

    // Get token contracts
    const { contract: dUSD, tokenInfo: dusdInfo } =
      await getTokenContractForSymbol(dusdDeployer, "dUSD");
    const { contract: frax, tokenInfo: fraxInfo } =
      await getTokenContractForSymbol(dusdDeployer, "FRAX");
    const { contract: usdc, tokenInfo: usdcInfo } =
      await getTokenContractForSymbol(dusdDeployer, "USDC");

    // Set up a mock oracle for testing
    const mockOracleAggregator = await hre.ethers.deployContract(
      "MockOracleAggregator",
      [ZeroAddress, BigInt(10) ** BigInt(AAVE_ORACLE_USD_DECIMALS)],
      await hre.ethers.getSigner(dusdDeployer),
    );

    const mockOracle = mockOracleAggregator as MockOracleAggregator;

    // Set oracle prices (8-decimal oracle prices)
    await mockOracle.setAssetPrice(
      dusdInfo.address,
      parseUnits("1", AAVE_ORACLE_USD_DECIMALS), // $1.00 for dUSD
    );
    await mockOracle.setAssetPrice(
      fraxInfo.address,
      parseUnits("1", AAVE_ORACLE_USD_DECIMALS), // $1.00 for FRAX
    );
    await mockOracle.setAssetPrice(
      usdcInfo.address,
      parseUnits("1", AAVE_ORACLE_USD_DECIMALS), // $1.00 for USDC
    );

    // Helper function to mint dUSD to test accounts
    const mintDUSD = async (to: string, amount: string): Promise<void> => {
      const amountWei = parseUnits(amount, DUSD_DECIMALS);
      const deployerSigner = await hre.ethers.getSigner(dusdDeployer);

      // dUSD is deployed as MintableERC20 in test environment
      await dUSD.connect(deployerSigner).mint(to, amountWei);
    };

    // Helper function to setup test environment
    const setupTestEnvironment = async (): Promise<void> => {
      // No manual setup needed - deployment scripts should have configured everything
      // Just verify the system is properly configured
      const currentRouter = await dStakeToken.router();
      const currentVault = await dStakeToken.collateralVault();
      const defaultVaultAsset = await router.defaultDepositVaultAsset();

      console.log(`dSTAKE router: ${currentRouter}`);
      console.log(`dSTAKE collateral vault: ${currentVault}`);
      console.log(`dSTAKE default vault asset: ${defaultVaultAsset}`);

      if (currentRouter === ZeroAddress) {
        throw new Error(
          "dSTAKE token router not configured - deployment failed",
        );
      }

      if (currentVault === ZeroAddress) {
        throw new Error(
          "dSTAKE token collateral vault not configured - deployment failed",
        );
      }

      if (defaultVaultAsset === ZeroAddress) {
        throw new Error(
          "dSTAKE router defaultDepositVaultAsset not configured - deployment failed",
        );
      }

      console.log("✅ dSTAKE system properly configured by deployment scripts");

      // Mint initial dUSD to test accounts
      await mintDUSD(testAccount1, "10000"); // 10,000 dUSD
      await mintDUSD(testAccount2, "10000"); // 10,000 dUSD
      await mintDUSD(dusdDeployer, "100000"); // 100,000 dUSD for deployer

      // Approve dSTAKE token to spend dUSD for test accounts
      const account1Signer = await hre.ethers.getSigner(testAccount1);
      const account2Signer = await hre.ethers.getSigner(testAccount2);
      const deployerSigner = await hre.ethers.getSigner(dusdDeployer);

      await dUSD
        .connect(account1Signer)
        .approve(
          await dStakeToken.getAddress(),
          parseUnits("10000", DUSD_DECIMALS),
        );
      await dUSD
        .connect(account2Signer)
        .approve(
          await dStakeToken.getAddress(),
          parseUnits("10000", DUSD_DECIMALS),
        );
      await dUSD
        .connect(deployerSigner)
        .approve(
          await dStakeToken.getAddress(),
          parseUnits("100000", DUSD_DECIMALS),
        );
    };

    return {
      // Contracts
      dStakeToken,
      collateralVault,
      router,
      oracleAggregator,
      mockOracle,
      dUSD,
      frax,
      usdc,

      // Token info
      dusdInfo,
      fraxInfo,
      usdcInfo,

      // Named accounts
      accounts: {
        dusdDeployer,
        testAccount1,
        testAccount2,
      },

      // Helper functions
      mintDUSD,
      setupTestEnvironment,

      // Test amounts for convenience
      amounts: {
        small: TestAmounts.dusd.small,
        medium: TestAmounts.dusd.medium,
        large: TestAmounts.dusd.large,
      },

      // Fee constants
      fees: {
        zero: TestAmounts.fees.zeroPercent,
        onePercent: TestAmounts.fees.onePercent,
        fivePercent: TestAmounts.fees.fivePercent,
        max: TestAmounts.fees.maxFee,
      },
    };
  },
);

export const createDBoostFixture = deployments.createFixture(
  async ({ deployments, getNamedAccounts }) => {
    // dBOOST would use similar pattern but with dBOOST deployment tags
    // For now, this is a placeholder as dBOOST may not be fully deployed
    await deployments.fixture();
    await deployments.fixture(["dBoost", "dusd"]); // Assuming dBOOST deployment tag exists

    const { dusdDeployer, testAccount1, testAccount2 } =
      await getNamedAccounts();

    // Similar setup to dSTAKE but for dBOOST contracts
    // This would need to be updated based on actual dBOOST deployment structure

    return {
      accounts: {
        dusdDeployer,
        testAccount1,
        testAccount2,
      },
      // Add dBOOST specific contracts when available
    };
  },
);

export const createVestingNFTFixture = deployments.createFixture(
  async ({ deployments, getNamedAccounts }) => {
    // First create the base dSTAKE fixture
    const dstakeFixture = await createDStakeFixture({
      deployments,
      getNamedAccounts,
    });

    // Add vesting NFT specific setup
    const vestingNFTDeployment = await deployments.get(ERC20_VESTING_NFT_ID);

    const vestingNFT = await hre.ethers.getContractAt(
      "ERC20VestingNFT",
      vestingNFTDeployment.address,
      await hre.ethers.getSigner(dstakeFixture.accounts.dusdDeployer),
    );

    // Setup dSTAKE tokens for vesting tests
    await dstakeFixture.setupTestEnvironment();

    // Get some dSTAKE tokens for test accounts by depositing dUSD
    const depositAmount = parseUnits("1000", DUSD_DECIMALS); // 1000 dUSD

    const account1Signer = await hre.ethers.getSigner(
      dstakeFixture.accounts.testAccount1,
    );
    const account2Signer = await hre.ethers.getSigner(
      dstakeFixture.accounts.testAccount2,
    );

    // Deposit dUSD to get dSTAKE tokens
    await dstakeFixture.dStakeToken
      .connect(account1Signer)
      .deposit(depositAmount, dstakeFixture.accounts.testAccount1);
    await dstakeFixture.dStakeToken
      .connect(account2Signer)
      .deposit(depositAmount, dstakeFixture.accounts.testAccount2);

    // Approve vesting NFT to spend dSTAKE tokens
    const dStakeTokenAddress = await dstakeFixture.dStakeToken.getAddress();
    const vestingNFTAddress = await vestingNFT.getAddress();

    const dstakeBalance1 = await dstakeFixture.dStakeToken.balanceOf(
      dstakeFixture.accounts.testAccount1,
    );
    const dstakeBalance2 = await dstakeFixture.dStakeToken.balanceOf(
      dstakeFixture.accounts.testAccount2,
    );

    await dstakeFixture.dStakeToken
      .connect(account1Signer)
      .approve(vestingNFTAddress, dstakeBalance1);
    await dstakeFixture.dStakeToken
      .connect(account2Signer)
      .approve(vestingNFTAddress, dstakeBalance2);

    return {
      ...dstakeFixture,
      vestingNFT,

      // Additional helper for vesting tests
      vestingHelpers: {
        dstakeBalance1,
        dstakeBalance2,
        dStakeTokenAddress,
        vestingNFTAddress,
      },
    };
  },
);
