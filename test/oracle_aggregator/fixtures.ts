import { ZeroAddress } from "ethers";
import hre, { deployments } from "hardhat";

import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { deployContract } from "../../utils/deploy";
import { deployTestTokens } from "../../utils/token";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { API3_PRICE_DECIMALS, FAKE_API3_SERVER_V1_ADDRESS } from "./constants";

export const dexOracleFixture = deployments.createFixture(
  async ({ deployments }) => {
    await deployments.fixture(); // Start from a fresh deployment to avoid side-effects from other fixtures
    // Barebones deployment does not assume dLEND and dSWAP
    await deployments.fixture(["oracle-aggregator"]);

    const { dusdDeployer } = await hre.getNamedAccounts();

    // Deploy some mock collateral tokens
    await deployTestTokens(
      hre,
      {
        FRAX: [
          {
            amount: 1e8,
            toAddress: dusdDeployer,
          },
        ],
        sDAI: [
          {
            amount: 1e8,
            toAddress: dusdDeployer,
          },
        ],
      },
      await hre.ethers.getSigner(dusdDeployer),
    );
    const { tokenInfo: fraxInfo } = await getTokenContractForSymbol(
      dusdDeployer,
      "FRAX",
    );
    const { tokenInfo: sdaiInfo } = await getTokenContractForSymbol(
      dusdDeployer,
      "sDAI",
    );

    // Deploy a mock oracle
    const { address: mockStaticOracleWrapperAddress } = await deployContract(
      hre,
      "MockStaticOracleWrapper",
      [ZeroAddress, BigInt(10) ** BigInt(AAVE_ORACLE_USD_DECIMALS)], // ZeroAddress is USD
      undefined,
      await hre.ethers.getSigner(dusdDeployer),
      undefined,
      "MockStaticOracleWrapper",
    );

    // Deploy DexOracleWrapper that wraps the MockStaticOracleWrapper
    await deployContract(
      hre,
      "DexOracleWrapper",
      [mockStaticOracleWrapperAddress],
      undefined,
      await hre.ethers.getSigner(dusdDeployer),
      undefined,
      "DexOracleWrapper",
    );

    // Set prices for the mock oracle
    const mockStaticOracleWrapperContract = await hre.ethers.getContractAt(
      "MockStaticOracleWrapper",
      mockStaticOracleWrapperAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );
    await mockStaticOracleWrapperContract.setAssetPrice(
      fraxInfo.address,
      hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS),
    );
    await mockStaticOracleWrapperContract.setAssetPrice(
      sdaiInfo.address,
      hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS),
    );
  },
);

export const api3OracleFixture = deployments.createFixture(
  async ({ deployments }) => {
    await deployments.fixture(); // Start from a fresh deployment
    await deployments.fixture(["oracle-aggregator"]);

    const { dusdDeployer } = await hre.getNamedAccounts();
    const deployer = await hre.ethers.getSigner(dusdDeployer);

    // Deploy test tokens: FRAX and sFRAX
    await deployTestTokens(
      hre,
      {
        FRAX: [
          {
            amount: 1e8,
            toAddress: dusdDeployer,
          },
        ],
        sFRAX: [
          {
            amount: 1e8,
            toAddress: dusdDeployer,
          },
        ],
      },
      deployer,
    );

    const { tokenInfo: fraxInfo } = await getTokenContractForSymbol(
      dusdDeployer,
      "FRAX",
    );
    const { tokenInfo: sfraxInfo } = await getTokenContractForSymbol(
      dusdDeployer,
      "sFRAX",
    );

    // Deploy MockAPI3Oracle for FRAX
    const { address: mockAPI3OracleFRAXAddress } = await deployContract(
      hre,
      "MockAPI3OracleFRAX",
      [FAKE_API3_SERVER_V1_ADDRESS], // Placeholder for API3ServerV1 address
      undefined,
      deployer,
      undefined,
      "MockAPI3Oracle",
    );

    // Deploy MockAPI3Oracle for sFRAX
    const { address: mockAPI3OracleSFRAXAddress } = await deployContract(
      hre,
      "MockAPI3OracleSFRAX",
      [FAKE_API3_SERVER_V1_ADDRESS], // Placeholder for API3ServerV1 address
      undefined,
      deployer,
      undefined,
      "MockAPI3Oracle",
    );

    // Set initial mock prices and timestamps
    const currentBlock = await hre.ethers.provider.getBlock("latest");

    if (!currentBlock) {
      throw new Error("Failed to get current block");
    }
    const currentTimestamp = currentBlock.timestamp;
    const mockAPI3OracleFRAXContract = await hre.ethers.getContractAt(
      "MockAPI3Oracle",
      mockAPI3OracleFRAXAddress,
      deployer,
    );
    await mockAPI3OracleFRAXContract.setMock(
      hre.ethers.parseUnits("1", API3_PRICE_DECIMALS),
      currentTimestamp,
    );
    const mockAPI3OracleSFRAXContract = await hre.ethers.getContractAt(
      "MockAPI3Oracle",
      mockAPI3OracleSFRAXAddress,
      deployer,
    );
    await mockAPI3OracleSFRAXContract.setMock(
      hre.ethers.parseUnits("1.1", API3_PRICE_DECIMALS),
      currentTimestamp,
    );

    // Deploy API3Wrapper
    const { address: api3WrapperAddress } = await deployContract(
      hre,
      "API3Wrapper",
      [10n ** BigInt(AAVE_ORACLE_USD_DECIMALS)],
      undefined,
      deployer,
      undefined,
    );

    // Deploy API3WrapperWithThresholding
    const { address: api3WrapperWithThresholdingAddress } =
      await deployContract(
        hre,
        "API3WrapperWithThresholding",
        [
          10n ** BigInt(AAVE_ORACLE_USD_DECIMALS),
          hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS), // Initial lower threshold
          hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS), // Initial fixed price
        ],
        undefined,
        deployer,
        undefined,
      );

    // Deploy API3CompositeWrapperWithThresholding
    const { address: api3CompositeWrapperWithThresholdingAddress } =
      await deployContract(
        hre,
        "API3CompositeWrapperWithThresholding",
        [10n ** BigInt(AAVE_ORACLE_USD_DECIMALS)],
        undefined,
        deployer,
        undefined,
      );

    // Point API3Wrapper to each corresponding MockAPI3Oracle
    const api3WrapperContract = await hre.ethers.getContractAt(
      "API3Wrapper",
      api3WrapperAddress,
      deployer,
    );
    await api3WrapperContract.setProxy(
      fraxInfo.address,
      mockAPI3OracleFRAXAddress,
    );
    await api3WrapperContract.setProxy(
      sfraxInfo.address,
      mockAPI3OracleSFRAXAddress,
    );

    // Point API3WrapperWithThresholding to each corresponding MockAPI3Oracle
    const api3WrapperWithThresholdingContract = await hre.ethers.getContractAt(
      "API3WrapperWithThresholding",
      api3WrapperWithThresholdingAddress,
      deployer,
    );
    await api3WrapperWithThresholdingContract.setProxy(
      fraxInfo.address,
      mockAPI3OracleFRAXAddress,
    );
    await api3WrapperWithThresholdingContract.setProxy(
      sfraxInfo.address,
      mockAPI3OracleSFRAXAddress,
    );

    // Add composite feeds to API3CompositeWrapperWithThresholding
    const api3CompositeWrapperWithThresholdingContract =
      await hre.ethers.getContractAt(
        "API3CompositeWrapperWithThresholding",
        api3CompositeWrapperWithThresholdingAddress,
        deployer,
      );
    // This simulates a composite feed between sFRAX/FRAX * FRAX/USD = sFRAX/USD
    await api3CompositeWrapperWithThresholdingContract.addCompositeFeed(
      sfraxInfo.address,
      mockAPI3OracleSFRAXAddress,
      mockAPI3OracleFRAXAddress,
      0, // No lower threshold for sFRAX/FRAX
      0, // No fixed price for sFRAX/FRAX
      hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS), // $1 threshold for FRAX/USD
      hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS), // $1 fixed price for FRAX/USD
    );

    return {
      fraxToken: fraxInfo,
      sfraxToken: sfraxInfo,
      mockAPI3OracleFRAXAddress,
      mockAPI3OracleSFRAXAddress,
      api3WrapperAddress,
      api3WrapperWithThresholdingAddress,
      api3CompositeWrapperWithThresholdingAddress,
    };
  },
);
