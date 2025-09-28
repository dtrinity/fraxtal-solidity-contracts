import chai from "chai";
import hre from "hardhat";

import { MintConfig } from "../../../config/types";
import { ERC20Test, StaticOracle, StaticOracleWrapper, UniswapV3Factory } from "../../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../../utils/constants";
import { deployContract } from "../../../utils/deploy";
import { deployTokensDefault } from "../../../utils/token";

export const CARDINALITY_PER_MINUTE = 10;
export const BASE_KNOWN_FEE_TIERS = [100, 500, 3_000, 10_000];

/**
 * Deploy the Uniswap V3 factory contract
 *
 * @returns The deployed contract
 */
export async function deployDEXFactory(): Promise<UniswapV3Factory> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(dexDeployer);

  // The UniswapV3Factory will be automatically found in contracts/dex/core/UniswapV3Factory.sol
  const res = await deployContract(
    hre,
    "UniswapV3Factory",
    [],
    undefined, // auto-filling gas limit
    deployer,
  );

  const resContract = await hre.ethers.getContractAt("UniswapV3Factory", res.address, deployer);
  chai.assert.isDefined(await resContract.getAddress());
  chai.assert.isNotEmpty(await resContract.getAddress());
  return resContract;
}

/**
 * Deploy the Static Oracle contract
 *
 * @param dexFactoryAddress - The address of the DEX factory contract
 * @returns The deployed contract
 */
export async function deployOracle(dexFactoryAddress: string): Promise<StaticOracle> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(dexDeployer);

  const deployedResult = await deployContract(
    hre,
    "StaticOracle",
    [dexFactoryAddress, CARDINALITY_PER_MINUTE],
    undefined, // auto-filling gas limit
    deployer,
  );
  const oracleContract = await hre.ethers.getContractAt("StaticOracle", deployedResult.address, deployer);
  chai.expect(await oracleContract.UNISWAP_V3_FACTORY()).to.equal(dexFactoryAddress);
  chai.expect(await oracleContract.CARDINALITY_PER_MINUTE()).to.equal(CARDINALITY_PER_MINUTE);
  chai.expect(await oracleContract.supportedFeeTiers()).to.deep.equal(BASE_KNOWN_FEE_TIERS);

  return oracleContract;
}

/**
 * Deploy the Static Oracle Wrapper contract
 *
 * @param oracleAddress - The address of the oracle contract
 * @param baseTokenAddress - The address of the base token
 * @param baseTokenAmountForQuoting - The amount of base token for quoting
 * @param quotePeriodSeconds - The quote period in seconds
 * @param priceDecimals - The price decimals (e.g. price of 123.45 has 2 decimals)
 * @returns The deployed contract
 */
export async function deployOracleWrapper(
  oracleAddress: string,
  baseTokenAddress: string,
  baseTokenAmountForQuoting: bigint,
  quotePeriodSeconds: number,
  priceDecimals: number,
): Promise<StaticOracleWrapper> {
  const { dexDeployer } = await hre.getNamedAccounts();
  const deployer = await hre.ethers.getSigner(dexDeployer);

  const deployedResult = await deployContract(
    hre,
    "StaticOracleWrapper",
    [
      oracleAddress,
      baseTokenAddress,
      baseTokenAmountForQuoting.toString(), // use toString to avoid ethers Overflow error
      quotePeriodSeconds,
      priceDecimals,
    ],
    undefined, // auto-filling gas limit
    deployer,
  );
  const oracleWrapperContract = await hre.ethers.getContractAt("StaticOracleWrapper", deployedResult.address, deployer);
  chai.expect(await oracleWrapperContract.BASE_CURRENCY()).to.equal(baseTokenAddress);

  const priceUnit = 10 ** AAVE_ORACLE_USD_DECIMALS;
  chai.expect(await oracleWrapperContract.BASE_CURRENCY_UNIT()).to.equal(BigInt(priceUnit));

  return oracleWrapperContract;
}

/**
 * Deploy test tokens
 *
 * @returns The deployed token contracts
 */
export async function deployTestTokens(mintInfos: { [tokenSymbol: string]: MintConfig[] }): Promise<{
  Token1: ERC20Test;
  Token2: ERC20Test;
  Token3: ERC20Test;
}> {
  const res = await deployTokensDefault(hre, mintInfos);

  chai.assert.isNotEmpty(res.Tokens.Token1.address);
  chai.assert.isDefined(res.Tokens.Token1.address);
  chai.assert.isNotEmpty(res.Tokens.Token2.address);
  chai.assert.isDefined(res.Tokens.Token2.address);
  chai.assert.isNotEmpty(res.Tokens.Token3.address);
  chai.assert.isDefined(res.Tokens.Token3.address);

  return {
    Token1: await hre.ethers.getContractAt("ERC20Test", res.Tokens.Token1.address),
    Token2: await hre.ethers.getContractAt("ERC20Test", res.Tokens.Token2.address),
    Token3: await hre.ethers.getContractAt("ERC20Test", res.Tokens.Token3.address),
  };
}
