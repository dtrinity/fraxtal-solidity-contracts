import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import { CollateralHolderVault, ERC20Test, IssuerV2_2, MintableERC20, MockOracleAggregator } from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standaloneMinimalFixture } from "./fixtures";

describe("IssuerV2_2", () => {
  let issuer: IssuerV2_2;
  let collateralVault: CollateralHolderVault;
  let frax: MintableERC20;
  let fraxDecimals: bigint;
  let dusd: ERC20Test;
  let dusdDecimals: bigint;
  let mockOracle: MockOracleAggregator;
  let dusdDeployer: Address;
  let testAccount1: Address;

  beforeEach(async function () {
    await standaloneMinimalFixture();

    ({ dusdDeployer, testAccount1 } = await getNamedAccounts());

    // Resolve core deps
    const { address: oracleAddress } = await hre.deployments.get("OracleAggregator");
    const { address: collateralVaultAddress } = await hre.deployments.get("CollateralHolderVault");

    const dusdFactory = await hre.ethers.getContractFactory("ERC20Test", await hre.ethers.getSigner(dusdDeployer));
    dusd = (await dusdFactory.deploy("dUSD", 6)) as ERC20Test;
    await dusd.waitForDeployment();
    dusdDecimals = BigInt(await dusd.decimals());

    collateralVault = await hre.ethers.getContractAt(
      "CollateralHolderVault",
      collateralVaultAddress,
      await hre.ethers.getSigner(dusdDeployer),
    );

    const { contract: fraxContract, tokenInfo: fraxInfo } = await getTokenContractForSymbol(dusdDeployer, "FRAX");
    frax = fraxContract;
    fraxDecimals = BigInt(fraxInfo.decimals);
    const { address: hardPegOracleWrapperAddress } = await hre.deployments.get("HardPegOracleWrapper");
    const oracleAggregator = await hre.ethers.getContractAt("OracleAggregator", oracleAddress, await hre.ethers.getSigner(dusdDeployer));
    await oracleAggregator.setOracle(await dusd.getAddress(), hardPegOracleWrapperAddress);

    // Grab mock oracle to adjust prices in tests
    const mockAddr = (await hre.deployments.get("MockOracleAggregator")).address;
    mockOracle = await hre.ethers.getContractAt("MockOracleAggregator", mockAddr, await hre.ethers.getSigner(dusdDeployer));

    // Deploy IssuerV2_2
    const factory = await hre.ethers.getContractFactory("IssuerV2_2", await hre.ethers.getSigner(dusdDeployer));
    issuer = await factory.deploy(collateralVaultAddress, await dusd.getAddress(), oracleAddress);
    await issuer.waitForDeployment();

    // Allow FRAX collateral and hand minting rights to issuer
    await collateralVault.allowCollateral(fraxInfo.address);
    await dusd.transferOwnership(await issuer.getAddress());

    // Mint collateral to test account
    const fraxAmount = hre.ethers.parseUnits("1000", fraxDecimals);
    await frax.mint(testAccount1, fraxAmount);
  });

  it("mints respecting deposit caps", async function () {
    const cap = hre.ethers.parseUnits("500", fraxDecimals);
    await issuer.setAssetDepositCap(await frax.getAddress(), cap);

    const collateralAmount = hre.ethers.parseUnits("600", fraxDecimals);
    await frax.connect(await hre.ethers.getSigner(testAccount1)).approve(await issuer.getAddress(), collateralAmount);

    await expect(
      issuer.connect(await hre.ethers.getSigner(testAccount1)).issue(collateralAmount, await frax.getAddress(), 0),
    ).to.be.revertedWithCustomError(issuer, "AssetDepositCapExceeded");
  });

  it("reverts when collateral value < total supply after mint (price drop)", async function () {
    // First mint at $1 price
    const amount = hre.ethers.parseUnits("1000", fraxDecimals);
    await frax.connect(await hre.ethers.getSigner(testAccount1)).approve(await issuer.getAddress(), amount);
    await issuer.connect(await hre.ethers.getSigner(testAccount1)).issue(amount, await frax.getAddress(), 0);

    // Drop price to $0.10
    await mockOracle.setAssetPrice(await frax.getAddress(), hre.ethers.parseUnits("0.1", AAVE_ORACLE_USD_DECIMALS));

    const smallerDeposit = hre.ethers.parseUnits("10", fraxDecimals);
    await frax.mint(testAccount1, smallerDeposit);
    await frax.connect(await hre.ethers.getSigner(testAccount1)).approve(await issuer.getAddress(), smallerDeposit);

    await expect(
      issuer.connect(await hre.ethers.getSigner(testAccount1)).issue(smallerDeposit, await frax.getAddress(), 0),
    ).to.be.revertedWithCustomError(issuer, "IssuanceSurpassesCollateral");
  });

  it("issues using excess collateral and preserves invariant", async function () {
    const deposit = hre.ethers.parseUnits("100", fraxDecimals);
    const minDusd = hre.ethers.parseUnits("90", dusdDecimals); // loose slippage guard

    await frax.connect(await hre.ethers.getSigner(testAccount1)).approve(await issuer.getAddress(), deposit);
    await issuer.connect(await hre.ethers.getSigner(testAccount1)).issue(deposit, await frax.getAddress(), minDusd);

    // Seed excess collateral directly into the vault
    await frax.mint(collateralVault.getAddress(), hre.ethers.parseUnits("20", fraxDecimals));

    const mintAmount = hre.ethers.parseUnits("10", dusdDecimals);
    await issuer.issueUsingExcessCollateral(testAccount1, mintAmount);

    const totalSupply = await dusd.totalSupply();
    const collateralCover = await issuer.collateralInDusd();
    assert.isTrue(collateralCover >= totalSupply);
  });
});
