import { FeeAmount } from "@uniswap/v3-sdk";
import { ZeroAddress } from "ethers";
import hre, { deployments } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { CollateralVault, Issuer, MintableERC20 } from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { deployContract } from "../../utils/deploy";
import { COLLATERAL_VAULT_CONTRACT_ID, ISSUER_CONTRACT_ID, REDEEMER_CONTRACT_ID } from "../../utils/deploy-ids";
import { ORACLE_AGGREGATOR_ID } from "../../utils/oracle/deploy-ids";
import { deployTestTokens, TokenInfo } from "../../utils/token";
import { increaseTime } from "../ecosystem/utils.chain";
import { createPoolAddLiquidityWithApproval, swapExactInputSingleWithApproval } from "../ecosystem/utils.dex";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";

export const standaloneMinimalFixture = deployments.createFixture(async ({ deployments }) => {
  await deployments.fixture(); // Start from a fresh deployment to avoid side-effects from other fixtures
  // Barebones deployment does not assume dLEND and dSWAP
  await deployments.fixture(["dusd"]);

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
      USDC: [
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
  const { tokenInfo: fraxInfo } = await getTokenContractForSymbol(dusdDeployer, "FRAX");
  const { tokenInfo: usdcInfo } = await getTokenContractForSymbol(dusdDeployer, "USDC");
  const { tokenInfo: sdaiInfo } = await getTokenContractForSymbol(dusdDeployer, "sDAI");

  const { tokenInfo: dusdInfo } = await getTokenContractForSymbol(dusdDeployer, "dUSD");

  // Deploy a mock oracle that could be the dLEND oracle or something else
  const { address: mockOracleAggregatorAddress } = await deployContract(
    hre,
    "MockOracleAggregator",
    [ZeroAddress, BigInt(10) ** BigInt(AAVE_ORACLE_USD_DECIMALS)],
    undefined,
    await hre.ethers.getSigner(dusdDeployer),
    undefined,
    "MockOracleAggregator",
  );

  // Set prices for the mock oracle
  const mockOracleAggregatorContract = await hre.ethers.getContractAt(
    "MockOracleAggregator",
    mockOracleAggregatorAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );
  await mockOracleAggregatorContract.setAssetPrice(fraxInfo.address, hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS));
  await mockOracleAggregatorContract.setAssetPrice(usdcInfo.address, hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS));
  await mockOracleAggregatorContract.setAssetPrice(sdaiInfo.address, hre.ethers.parseUnits("1.1", AAVE_ORACLE_USD_DECIMALS));

  // Point OracleAggregator to the mock oracle
  const { address: oracleAggregatorAddress } = await hre.deployments.get(ORACLE_AGGREGATOR_ID);
  const oracleAggregator = await hre.ethers.getContractAt(
    "OracleAggregator",
    oracleAggregatorAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );
  await oracleAggregator.grantRole(await oracleAggregator.ORACLE_MANAGER_ROLE(), dusdDeployer);
  await oracleAggregator.setOracle(fraxInfo.address, mockOracleAggregatorAddress);
  await oracleAggregator.setOracle(usdcInfo.address, mockOracleAggregatorAddress);
  await oracleAggregator.setOracle(sdaiInfo.address, mockOracleAggregatorAddress);

  await setupDusdEcosystem(hre, oracleAggregatorAddress as string, dusdInfo.address, dusdDeployer);
});

export const standaloneAmoFixture = deployments.createFixture(async ({ deployments }) => {
  // Start with the base fixture
  await standaloneMinimalFixture(deployments);

  const { dusdDeployer } = await hre.getNamedAccounts();
  const { address: amoManagerAddress } = await deployments.get("AmoManager");
  const { tokenInfo: dusdInfo } = await getTokenContractForSymbol(dusdDeployer, "dUSD");
  const { address: mockOracleAggregatorAddress } = await deployments.get(ORACLE_AGGREGATOR_ID);

  // Deploy MockAmoVault
  await deployContract(
    hre,
    "MockAmoVault",
    [dusdInfo.address, amoManagerAddress, dusdDeployer, dusdDeployer, dusdDeployer, mockOracleAggregatorAddress],
    undefined,
    await hre.ethers.getSigner(dusdDeployer),
    undefined,
  );
});

export const standardDUSDDEXFixture = deployments.createFixture(async ({ deployments }) => {
  await deployments.fixture(); // Start from a fresh deployment to avoid side-effects from other fixtures
  await deployments.fixture(["mock", "dex", "dusd"]); // dUSD ecosystem and dSwap
  const { dexLiquidityAdder, testTokenDeployer, dusdDeployer } = await hre.getNamedAccounts();

  /*
   * Get shared token info
   */
  const sFraxPriceInDusd = 1.25;
  const { tokenInfo: dusdInfo } = await getTokenContractForSymbol(testTokenDeployer, "dUSD");

  const { contract: sfrax, tokenInfo: sfraxInfo } = await getTokenContractForSymbol(testTokenDeployer, "SFRAX");

  /*
   * Mint some dUSD so it can be added as dex pool liquidity
   */

  // Deploy a mock oracle so we can mint some dUSD
  const { address: mockStaticOracleWrapperAddress } = await deployContract(
    hre,
    "MockStaticOracleWrapper",
    [dusdInfo.address, BigInt(10) ** BigInt(AAVE_ORACLE_USD_DECIMALS)],
    undefined,
    await hre.ethers.getSigner(dusdDeployer),
    undefined,
    "MockStaticOracleWrapper",
  );

  // Set prices for the mock oracle
  const mockStaticOracleWrapperContract = await hre.ethers.getContractAt(
    "MockStaticOracleWrapper",
    mockStaticOracleWrapperAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );
  await mockStaticOracleWrapperContract.setAssetPrice(
    sfraxInfo.address,
    hre.ethers.parseUnits(sFraxPriceInDusd.toString(), AAVE_ORACLE_USD_DECIMALS),
  );

  await setupDusdEcosystem(hre, mockStaticOracleWrapperAddress as string, dusdInfo.address, dusdDeployer);

  const issuerAddress = (await hre.deployments.get(ISSUER_CONTRACT_ID)).address;
  const issuer = await hre.ethers.getContractAt("Issuer", issuerAddress, await hre.ethers.getSigner(dusdDeployer));

  const collateralVaultAddress = await issuer.collateralVault();
  const collateralVault = await hre.ethers.getContractAt(
    "CollateralHolderVault",
    collateralVaultAddress,
    await hre.ethers.getSigner(dusdDeployer),
  );

  // Allow sFRAX as collateral
  await collateralVault.allowCollateral(sfraxInfo.address);

  // Mint some sFRAX to dexLiquidityAdder as dUSD collateral
  const initialDUSDLiquidityAmount = 1_000_000;
  const initialSFRAXLiquidityAmount = initialDUSDLiquidityAmount / sFraxPriceInDusd;
  await mintDUSDWithSFRAXCollateral(
    hre,
    sfrax,
    issuer,
    collateralVault,
    dexLiquidityAdder,
    initialDUSDLiquidityAmount,
    sFraxPriceInDusd,
    dusdInfo,
    sfraxInfo,
  );

  /*
   * Set up DEX infra
   */

  // Mint some sFRAX to dexDeployer as dex liquidity
  await sfrax.mint(dexLiquidityAdder, hre.ethers.parseUnits(initialSFRAXLiquidityAmount.toString(), sfraxInfo.decimals));

  // Create dUSD/SFRAX pool
  await createPoolAddLiquidityWithApproval(
    dexLiquidityAdder,
    FeeAmount.HIGH,
    dusdInfo.address,
    sfraxInfo.address,
    initialDUSDLiquidityAmount,
    initialSFRAXLiquidityAmount,
    6000,
  );

  // Warm up the pools by making some swaps
  console.log("Minting 1 dUSD for warmup");
  await mintDUSDWithSFRAXCollateral(hre, sfrax, issuer, collateralVault, dexLiquidityAdder, 1, sFraxPriceInDusd, dusdInfo, sfraxInfo);

  console.log("Warming up sFRAX price");

  for (let i = 0; i < 1; i++) {
    // SFRAX
    await swapExactInputSingleWithApproval(dexLiquidityAdder, FeeAmount.HIGH, dusdInfo.address, sfraxInfo.address, 1, 6000);
    await increaseTime(60);
  }
});

const mintDUSDWithSFRAXCollateral = async (
  hre: HardhatRuntimeEnvironment,
  sfrax: MintableERC20,
  issuer: Issuer,
  collateralVault: CollateralVault,
  dexLiquidityAdder: string,
  initialDUSDAmount: number,
  sFraxPriceInDusd: number,
  dusdInfo: TokenInfo,
  sfraxInfo: TokenInfo,
): Promise<{ dUSDAmount: bigint; sFraxAmount: bigint }> => {
  const collateralAmount = initialDUSDAmount / sFraxPriceInDusd;
  const dUSDAmount = hre.ethers.parseUnits(initialDUSDAmount.toString(), dusdInfo.decimals);
  const sFraxAmount = hre.ethers.parseUnits(collateralAmount.toString(), sfraxInfo.decimals);

  await sfrax.mint(dexLiquidityAdder, sFraxAmount);

  await sfrax.connect(await hre.ethers.getSigner(dexLiquidityAdder)).approve(await issuer.getAddress(), sFraxAmount);

  await issuer.connect(await hre.ethers.getSigner(dexLiquidityAdder)).issue(sFraxAmount, sfraxInfo.address, dUSDAmount);

  return { dUSDAmount, sFraxAmount };
};

const setupDusdEcosystem = async (
  hre: HardhatRuntimeEnvironment,
  oracleAddress: string,
  dusdAddress: string,
  dusdDeployer: string,
): Promise<void> => {
  // Update dUSD contracts with oracle
  const setOracleForContract = async (contractId: string, contractName: string): Promise<void> => {
    const { address } = await hre.deployments.get(contractId);
    const contract = await hre.ethers.getContractAt(contractName, address, await hre.ethers.getSigner(dusdDeployer));
    await contract.setOracle(oracleAddress);
  };

  await setOracleForContract(COLLATERAL_VAULT_CONTRACT_ID, "CollateralHolderVault");
  await setOracleForContract(REDEEMER_CONTRACT_ID, "Redeemer");
  await setOracleForContract(ISSUER_CONTRACT_ID, "Issuer");

  // Assign minting rights to the issuer
  const dusdContract = await hre.ethers.getContractAt("ERC20StablecoinUpgradeable", dusdAddress, await hre.ethers.getSigner(dusdDeployer));
  const { address: dusdIssuerAddress } = await hre.deployments.get(ISSUER_CONTRACT_ID);
  await dusdContract.grantRole(await dusdContract.MINTER_ROLE(), dusdIssuerAddress);
};
