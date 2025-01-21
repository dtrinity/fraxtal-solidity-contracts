import curve from "@curvefi/api";
import { expect } from "chai";
import hre from "hardhat";

import { createCurvePoolAddLiquidity } from "../ecosystem/utils.curve";

describe("Curve Pool Creation", function () {
  let deployer: string;
  let token0Address: string;
  let token1Address: string;

  before(async function () {
    if (hre.network.name !== "local_ethereum") {
      console.log("This test is only run on local_ethereum network");
      this.skip();
    }

    // Initialize Curve API
    await curve.init(
      "Infura",
      {
        network: "mainnet",
        apiKey: "9c52fc4e27554e868b243c18bf9631c7",
      },
      {
        chainId: 1,
      },
    );

    // Fetch existing pools
    await curve.factory.fetchPools();
    await curve.cryptoFactory.fetchPools();
    await curve.factory.fetchNewPools();
    await curve.cryptoFactory.fetchNewPools();

    // Get deployer address
    const { dusdDeployer } = await hre.getNamedAccounts();
    deployer = dusdDeployer;
    const signer = await hre.ethers.getSigner(deployer);
    const feeData = await hre.ethers.provider.getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas || undefined;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || undefined;
    const ERC20TestContractPath = "contracts/test/ERC20Test.sol:ERC20Test";

    // Deploy mock tokens using deployTestTokens
    const deployToken0Result = await hre.deployments.deploy("TOKEN0", {
      from: deployer,
      args: ["TOKEN0", 18],
      contract: ERC20TestContractPath,
      proxy: undefined,
      libraries: undefined,
      autoMine: true,
      log: false,
      maxFeePerGas: maxFeePerGas?.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
    });
    token0Address = deployToken0Result.address;
    let token0 = await hre.ethers.getContractAt(
      deployToken0Result.abi,
      deployToken0Result.address,
      signer,
    );
    token0 = await token0.waitForDeployment();
    await token0.mint(deployer, hre.ethers.parseUnits("100000000", 18), {
      maxFeePerGas: maxFeePerGas?.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
    });

    const deployToken1Result = await hre.deployments.deploy("TOKEN1", {
      from: deployer,
      args: ["TOKEN1", 18],
      contract: ERC20TestContractPath,
      proxy: undefined,
      libraries: undefined,
      autoMine: true,
      log: false,
      maxFeePerGas: maxFeePerGas?.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
    });
    token1Address = deployToken1Result.address;
    let token1 = await hre.ethers.getContractAt(
      deployToken1Result.abi,
      deployToken1Result.address,
      signer,
    );
    token1 = await token1.waitForDeployment();
    await token1.mint(deployer, hre.ethers.parseUnits("100000000", 18), {
      maxFeePerGas: maxFeePerGas?.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
    });
  });

  it("should create a Curve crypto pool and add liquidity", async () => {
    const poolName = "Test Crypto Pool";
    const poolSymbol = "TCP";
    const initialPrice = 1500; // 1 token0 = 1500 token1
    const token0Amount = 100; // 100 token0

    const result = await createCurvePoolAddLiquidity(
      deployer,
      token0Address,
      token1Address,
      token0Amount,
      poolName,
      poolSymbol,
      initialPrice,
      curve,
      400000, // A
      0.0000725, // gamma
      0.25, // midFee (0.25%)
      0.45, // outFee (0.45%)
      0.000002, // allowedExtraProfit
      0.00023, // feeGamma
      0.000146, // adjustmentStep
      600, // maHalfTime
    );

    // Verify pool creation
    expect(result.poolAddress).to.not.equal(hre.ethers.ZeroAddress);
    expect(result.gaugeAddress).to.not.equal(hre.ethers.ZeroAddress);

    // Verify pool exists in Curve registry
    const pool = curve.getPool(result.poolAddress);
    expect(pool).to.not.be.undefined;

    // Verify underlying balances
    const balances = result.underlyingBalances;
    expect(balances.length).to.equal(2);
    expect(Number(balances[0])).to.be.greaterThan(0);
    expect(Number(balances[1])).to.be.greaterThan(0);
  });

  it("should fail with invalid parameters", async () => {
    const poolName = "Invalid Pool";
    const poolSymbol = "IP";
    const initialPrice = 1000;
    const token0Amount = 100;

    // Test with invalid A parameter
    await expect(
      createCurvePoolAddLiquidity(
        deployer,
        token0Address,
        token1Address,
        token0Amount,
        poolName,
        poolSymbol,
        initialPrice,
        curve,
        0, // Invalid A parameter
        0.0000725,
        0.25,
        0.45,
        0.000002,
        0.00023,
        0.000146,
        600,
      ),
    ).to.be.revertedWith("Invalid amplification coefficient");

    // Test with invalid fee parameters
    await expect(
      createCurvePoolAddLiquidity(
        deployer,
        token0Address,
        token1Address,
        token0Amount,
        poolName,
        poolSymbol,
        initialPrice,
        curve,
        400000,
        0.0000725,
        1.5, // Invalid mid fee (>100%)
        0.45,
        0.000002,
        0.00023,
        0.000146,
        600,
      ),
    ).to.be.revertedWith("Invalid fee parameter");
  });
});
