import { assert, expect } from "chai";
import hre, { getNamedAccounts } from "hardhat";
import { Address } from "hardhat-deploy/types";

import { AmoDebtToken, AmoManagerV2, CollateralHolderVault, ERC20StablecoinUpgradeable, MintableERC20 } from "../../typechain-types";
import { AAVE_ORACLE_USD_DECIMALS } from "../../utils/constants";
import { getTokenContractForSymbol } from "../ecosystem/utils.token";
import { standaloneMinimalFixture } from "./fixtures";

describe("AmoManagerV2", () => {
  let manager: AmoManagerV2;
  let debtToken: AmoDebtToken;
  let vault: CollateralHolderVault;
  let dusd: ERC20StablecoinUpgradeable;
  let frax: MintableERC20;
  let dusdDecimals: bigint;
  let fraxDecimals: bigint;
  let dusdDeployer: Address;
  let testAccount1: Address;

  beforeEach(async function () {
    await standaloneMinimalFixture();
    ({ dusdDeployer, testAccount1 } = await getNamedAccounts());

    const { address: oracleAddress } = await hre.deployments.get("OracleAggregator");
    const { address: collateralVaultAddress } = await hre.deployments.get("CollateralHolderVault");
    vault = await hre.ethers.getContractAt("CollateralHolderVault", collateralVaultAddress, await hre.ethers.getSigner(dusdDeployer));

    const dusdDeployment = await hre.deployments.get("dUSD");
    dusd = await hre.ethers.getContractAt("ERC20StablecoinUpgradeable", dusdDeployment.address, await hre.ethers.getSigner(dusdDeployer));
    dusdDecimals = BigInt(await dusd.decimals());

    const { contract: fraxContract, tokenInfo: fraxInfo } = await getTokenContractForSymbol(dusdDeployer, "FRAX");
    frax = fraxContract;
    fraxDecimals = BigInt(fraxInfo.decimals);

    // Deploy debt token and manager
    const debtFactory = await hre.ethers.getContractFactory("AmoDebtToken", await hre.ethers.getSigner(dusdDeployer));
    debtToken = await debtFactory.deploy("dTRINITY AMO Receipt", "amo-dUSD");
    await debtToken.waitForDeployment();

    // Ensure the oracle can price the debt token for peg guard checks
    const oracleAggregator = await hre.ethers.getContractAt("OracleAggregator", oracleAddress, await hre.ethers.getSigner(dusdDeployer));

    if ((await oracleAggregator.assetOracles(await debtToken.getAddress())) === hre.ethers.ZeroAddress) {
      const { address: hardPegOracleWrapperAddress } = await hre.deployments.get("HardPegOracleWrapper");
      await oracleAggregator.setOracle(await debtToken.getAddress(), hardPegOracleWrapperAddress);
    }
    const mockOracle = await hre.ethers.getContractAt(
      "MockOracleAggregator",
      (await hre.deployments.get("MockOracleAggregator")).address,
      await hre.ethers.getSigner(dusdDeployer),
    );
    // Point dUSD to the mock oracle so we can manipulate peg during tests
    await oracleAggregator.setOracle(await dusd.getAddress(), await mockOracle.getAddress());
    await mockOracle.setAssetPrice(await dusd.getAddress(), hre.ethers.parseUnits("1", AAVE_ORACLE_USD_DECIMALS));

    const managerFactory = await hre.ethers.getContractFactory("AmoManagerV2", await hre.ethers.getSigner(dusdDeployer));
    manager = await managerFactory.deploy(oracleAddress, await debtToken.getAddress(), dusdDeployment.address, collateralVaultAddress);
    await manager.waitForDeployment();

    // Wire roles/allowlists
    await debtToken.grantRole(await debtToken.AMO_MANAGER_ROLE(), await manager.getAddress());
    await debtToken.setAllowlisted(collateralVaultAddress, true);
    await debtToken.setAllowlisted(await manager.getAddress(), true);
    await manager.setAmoWalletAllowed(testAccount1, true);
    await vault.allowCollateral(await debtToken.getAddress());
    await manager.setTolerance(hre.ethers.parseUnits("1000", AAVE_ORACLE_USD_DECIMALS));

    // Manager needs withdraw role to pull debt receipts back from vault
    await vault.grantRole(await vault.COLLATERAL_WITHDRAWER_ROLE(), await manager.getAddress());

    // Allow FRAX collateral for borrow/repay flows
    await vault.allowCollateral(await frax.getAddress());

    // Seed AMO wallet with FRAX and dUSD approvals
    await frax.mint(testAccount1, hre.ethers.parseUnits("1000", fraxDecimals));
    await dusd.grantRole(await dusd.MINTER_ROLE(), await manager.getAddress());
    await dusd.grantRole(await dusd.MINTER_ROLE(), dusdDeployer);
  });

  it("mints debt equal to dUSD base value on increaseAmoSupply", async function () {
    const amount = hre.ethers.parseUnits("50", dusdDecimals);
    await manager.grantRole(await manager.AMO_INCREASE_ROLE(), dusdDeployer);

    const debtSupplyBefore = await debtToken.totalSupply();
    const dusdSupplyBefore = await dusd.totalSupply();

    await manager.increaseAmoSupply(amount, testAccount1);

    const debtSupplyAfter = await debtToken.totalSupply();
    const dusdSupplyAfter = await dusd.totalSupply();

    const debtDelta = debtSupplyAfter - debtSupplyBefore;
    const dusdDelta = dusdSupplyAfter - dusdSupplyBefore;

    const expectedDebt = BigInt(amount) * 10n ** (18n - dusdDecimals);

    assert.equal(dusdDelta, amount);
    // Invariant within tolerance (1 base unit)
    expect(BigInt(debtDelta)).to.be.oneOf([expectedDebt, expectedDebt + 1n, expectedDebt - 1n]);
  });

  it("borrowTo and repayFrom preserve vault value within tolerance", async function () {
    await manager.grantRole(await manager.AMO_INCREASE_ROLE(), dusdDeployer);
    await manager.grantRole(await manager.AMO_DECREASE_ROLE(), dusdDeployer);

    // Seed vault with FRAX collateral
    const seed = hre.ethers.parseUnits("200", fraxDecimals);
    await frax.mint(await vault.getAddress(), seed);

    const amount = hre.ethers.parseUnits("50", fraxDecimals);
    await frax.connect(await hre.ethers.getSigner(testAccount1)).approve(await manager.getAddress(), amount);

    const preValue = await vault.totalValue();
    await manager.borrowTo(testAccount1, await frax.getAddress(), amount, 0);
    const postBorrowValue = await vault.totalValue();
    expect(postBorrowValue + 1n >= preValue).to.be.true; // tolerance is 1

    await frax.connect(await hre.ethers.getSigner(testAccount1)).approve(await manager.getAddress(), amount);
    await manager.repayFrom(testAccount1, await frax.getAddress(), amount, hre.ethers.MaxUint256);

    const postRepayValue = await vault.totalValue();
    expect(postRepayValue + 1n >= postBorrowValue).to.be.true;
  });

  it("peg guard blocks when price deviates", async function () {
    await manager.grantRole(await manager.AMO_INCREASE_ROLE(), dusdDeployer);
    // Set peg deviation to a tight threshold
    await manager.setPegDeviationBps(1); // 0.01%

    // Push oracle price off-peg via mock oracle
    const mockOracle = await hre.ethers.getContractAt(
      "MockOracleAggregator",
      (await hre.deployments.get("MockOracleAggregator")).address,
      await hre.ethers.getSigner(dusdDeployer),
    );
    await mockOracle.setAssetPrice(await dusd.getAddress(), hre.ethers.parseUnits("0.9", AAVE_ORACLE_USD_DECIMALS));

    const amount = hre.ethers.parseUnits("1", dusdDecimals);
    await expect(manager.increaseAmoSupply(amount, testAccount1)).to.be.revertedWithCustomError(manager, "PegDeviationExceeded");
  });
});
