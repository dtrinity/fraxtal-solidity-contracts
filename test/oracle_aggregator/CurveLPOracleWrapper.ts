import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
    CurveLPOracleWrapper,
    MockCurveStableSwapLP,
    MockOracleAggregator,
    MockERC20
} from "../../types";

describe("CurveLPOracleWrapper", function () {
    async function deployFixture() {
        const [owner, manager, user] = await ethers.getSigners();
        
        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("contracts/test/MockERC20.sol:MockERC20");
        const usdc = await MockERC20.deploy("USDC", "USDC");
        const dai = await MockERC20.deploy("DAI", "DAI");
        
        // Deploy mock oracle aggregator
        const MockOracleAggregator = await ethers.getContractFactory("MockOracleAggregator");
        const oracleAggregator = await MockOracleAggregator.deploy(
            ethers.ZeroAddress, // USD base currency
            ethers.parseUnits("1", 8) // 1e8 decimals
        );
        
        // Deploy mock Curve pool
        const MockCurveStableSwapLP = await ethers.getContractFactory("MockCurveStableSwapLP");
        const curvePool = await MockCurveStableSwapLP.deploy(
            "Curve USDC-DAI LP",
            "crvUSDCDAI",
            2 // 2 coins
        );
        
        // Setup pool coins
        await curvePool.setCoin(0, await usdc.getAddress());
        await curvePool.setCoin(1, await dai.getAddress());
        
        // Deploy CurveLPOracleWrapper
        const CurveLPOracleWrapper = await ethers.getContractFactory("CurveLPOracleWrapper");
        const lpOracle = await CurveLPOracleWrapper.deploy(
            ethers.parseUnits("1", 8), // 1e8 decimals to match Aave
            await oracleAggregator.getAddress()
        );
        
        // Grant manager role
        const ORACLE_MANAGER_ROLE = await lpOracle.ORACLE_MANAGER_ROLE();
        await lpOracle.grantRole(ORACLE_MANAGER_ROLE, manager.address);
        
        return {
            owner,
            manager,
            user,
            usdc,
            dai,
            oracleAggregator,
            curvePool,
            lpOracle,
            ORACLE_MANAGER_ROLE
        };
    }
    
    describe("Deployment", function () {
        it("Should set the correct base currency unit", async function () {
            const { lpOracle } = await loadFixture(deployFixture);
            expect(await lpOracle.BASE_CURRENCY_UNIT()).to.equal(ethers.parseUnits("1", 8));
        });
        
        it("Should set the correct oracle aggregator", async function () {
            const { lpOracle, oracleAggregator } = await loadFixture(deployFixture);
            expect(await lpOracle.oracleAggregator()).to.equal(await oracleAggregator.getAddress());
        });
        
        it("Should grant admin role to deployer", async function () {
            const { lpOracle, owner } = await loadFixture(deployFixture);
            const DEFAULT_ADMIN_ROLE = await lpOracle.DEFAULT_ADMIN_ROLE();
            expect(await lpOracle.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });
        
        it("Should revert if oracle aggregator is zero address", async function () {
            const CurveLPOracleWrapper = await ethers.getContractFactory("CurveLPOracleWrapper");
            await expect(
                CurveLPOracleWrapper.deploy(
                    ethers.parseUnits("1", 8),
                    ethers.ZeroAddress
                )
            ).to.be.revertedWithCustomError(CurveLPOracleWrapper, "InvalidAddress");
        });
    });
    
    describe("LP Configuration", function () {
        it("Should set LP config correctly", async function () {
            const { lpOracle, curvePool, usdc, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const pool = await curvePool.getAddress();
            const baseAsset = await usdc.getAddress();
            
            await lpOracle.connect(manager).setLPConfig(lpToken, pool, baseAsset);
            
            const config = await lpOracle.lpConfigs(lpToken);
            expect(config.pool).to.equal(pool);
            expect(config.baseAsset).to.equal(baseAsset);
            expect(config.baseAssetIndex).to.equal(0);
        });
        
        it("Should emit LPConfigSet event", async function () {
            const { lpOracle, curvePool, usdc, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const pool = await curvePool.getAddress();
            const baseAsset = await usdc.getAddress();
            
            await expect(lpOracle.connect(manager).setLPConfig(lpToken, pool, baseAsset))
                .to.emit(lpOracle, "LPConfigSet")
                .withArgs(lpToken, pool, baseAsset, 0);
        });
        
        it("Should find correct base asset index", async function () {
            const { lpOracle, curvePool, dai, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const pool = await curvePool.getAddress();
            const baseAsset = await dai.getAddress();
            
            await lpOracle.connect(manager).setLPConfig(lpToken, pool, baseAsset);
            
            const config = await lpOracle.lpConfigs(lpToken);
            expect(config.baseAssetIndex).to.equal(1); // DAI is at index 1
        });
        
        it("Should revert if not StableSwap pool", async function () {
            const { lpOracle, manager, usdc } = await loadFixture(deployFixture);
            
            // Deploy a contract without get_virtual_price
            const MockERC20 = await ethers.getContractFactory("contracts/test/MockERC20.sol:MockERC20");
            const fakePool = await MockERC20.deploy("Fake", "FAKE");
            
            await expect(
                lpOracle.connect(manager).setLPConfig(
                    await fakePool.getAddress(),
                    await fakePool.getAddress(),
                    await usdc.getAddress()
                )
            ).to.be.revertedWithCustomError(lpOracle, "NotStableSwapPool");
        });
        
        it("Should revert if base asset not in pool", async function () {
            const { lpOracle, curvePool, manager } = await loadFixture(deployFixture);
            
            // Deploy a token not in the pool
            const MockERC20 = await ethers.getContractFactory("contracts/test/MockERC20.sol:MockERC20");
            const weth = await MockERC20.deploy("WETH", "WETH");
            
            const lpToken = await curvePool.getAddress();
            const pool = await curvePool.getAddress();
            
            await expect(
                lpOracle.connect(manager).setLPConfig(lpToken, pool, await weth.getAddress())
            ).to.be.revertedWithCustomError(lpOracle, "BaseAssetNotInPool");
        });
        
        it("Should revert if any address is zero", async function () {
            const { lpOracle, curvePool, usdc, manager } = await loadFixture(deployFixture);
            
            await expect(
                lpOracle.connect(manager).setLPConfig(
                    ethers.ZeroAddress,
                    await curvePool.getAddress(),
                    await usdc.getAddress()
                )
            ).to.be.revertedWithCustomError(lpOracle, "InvalidAddress");
            
            await expect(
                lpOracle.connect(manager).setLPConfig(
                    await curvePool.getAddress(),
                    ethers.ZeroAddress,
                    await usdc.getAddress()
                )
            ).to.be.revertedWithCustomError(lpOracle, "InvalidAddress");
            
            await expect(
                lpOracle.connect(manager).setLPConfig(
                    await curvePool.getAddress(),
                    await curvePool.getAddress(),
                    ethers.ZeroAddress
                )
            ).to.be.revertedWithCustomError(lpOracle, "InvalidAddress");
        });
        
        it("Should only allow manager role to set config", async function () {
            const { lpOracle, curvePool, usdc, user } = await loadFixture(deployFixture);
            
            await expect(
                lpOracle.connect(user).setLPConfig(
                    await curvePool.getAddress(),
                    await curvePool.getAddress(),
                    await usdc.getAddress()
                )
            ).to.be.reverted;
        });
        
        it("Should remove LP config", async function () {
            const { lpOracle, curvePool, usdc, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            
            // First set config
            await lpOracle.connect(manager).setLPConfig(
                lpToken,
                await curvePool.getAddress(),
                await usdc.getAddress()
            );
            
            // Then remove it
            await lpOracle.connect(manager).removeLPConfig(lpToken);
            
            const config = await lpOracle.lpConfigs(lpToken);
            expect(config.pool).to.equal(ethers.ZeroAddress);
        });
        
        it("Should emit LPConfigRemoved event", async function () {
            const { lpOracle, curvePool, usdc, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            
            await lpOracle.connect(manager).setLPConfig(
                lpToken,
                await curvePool.getAddress(),
                await usdc.getAddress()
            );
            
            await expect(lpOracle.connect(manager).removeLPConfig(lpToken))
                .to.emit(lpOracle, "LPConfigRemoved")
                .withArgs(lpToken);
        });
    });
    
    describe("Price Calculation", function () {
        it("Should calculate LP price correctly", async function () {
            const { lpOracle, curvePool, usdc, oracleAggregator, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const usdcAddress = await usdc.getAddress();
            
            // Setup LP config
            await lpOracle.connect(manager).setLPConfig(lpToken, lpToken, usdcAddress);
            
            // Set virtual price to 1.05 (5% gain)
            const virtualPrice = ethers.parseUnits("1.05", 18);
            await curvePool.setVirtualPrice(virtualPrice);
            
            // Set USDC price to $1 (1e8 in 8 decimals)
            const usdcPrice = ethers.parseUnits("1", 8);
            await oracleAggregator.setAssetPrice(usdcAddress, usdcPrice);
            
            // Get LP price
            const [price, isAlive] = await lpOracle.getPriceInfo(lpToken);
            
            // LP price should be 1.05 * 1 = 1.05 in 8 decimals
            expect(price).to.equal(ethers.parseUnits("1.05", 8));
            expect(isAlive).to.be.true;
        });
        
        it("Should handle different base asset prices", async function () {
            const { lpOracle, curvePool, usdc, oracleAggregator, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const usdcAddress = await usdc.getAddress();
            
            await lpOracle.connect(manager).setLPConfig(lpToken, lpToken, usdcAddress);
            
            // Virtual price at 1.1
            await curvePool.setVirtualPrice(ethers.parseUnits("1.1", 18));
            
            // USDC at $0.99
            await oracleAggregator.setAssetPrice(usdcAddress, ethers.parseUnits("0.99", 8));
            
            const [price, isAlive] = await lpOracle.getPriceInfo(lpToken);
            
            // LP price = 1.1 * 0.99 = 1.089
            expect(price).to.equal(ethers.parseUnits("1.089", 8));
            expect(isAlive).to.be.true;
        });
        
        it("Should return false if base asset price not alive", async function () {
            const { lpOracle, curvePool, usdc, oracleAggregator, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const usdcAddress = await usdc.getAddress();
            
            await lpOracle.connect(manager).setLPConfig(lpToken, lpToken, usdcAddress);
            await curvePool.setVirtualPrice(ethers.parseUnits("1", 18));
            
            // Set USDC as not alive
            await oracleAggregator.setAssetAlive(usdcAddress, false);
            
            const [price, isAlive] = await lpOracle.getPriceInfo(lpToken);
            
            expect(price).to.equal(0);
            expect(isAlive).to.be.false;
        });
        
        it("Should revert if LP token not configured", async function () {
            const { lpOracle } = await loadFixture(deployFixture);
            
            const randomAddress = ethers.Wallet.createRandom().address;
            
            await expect(
                lpOracle.getPriceInfo(randomAddress)
            ).to.be.revertedWithCustomError(lpOracle, "LPTokenNotConfigured");
        });
        
        it("Should handle very large virtual prices", async function () {
            const { lpOracle, curvePool, usdc, oracleAggregator, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const usdcAddress = await usdc.getAddress();
            
            await lpOracle.connect(manager).setLPConfig(lpToken, lpToken, usdcAddress);
            
            // Set a very large virtual price (e.g., 10x growth)
            await curvePool.setVirtualPrice(ethers.parseUnits("10", 18));
            await oracleAggregator.setAssetPrice(usdcAddress, ethers.parseUnits("1", 8));
            
            const [price, isAlive] = await lpOracle.getPriceInfo(lpToken);
            
            expect(price).to.equal(ethers.parseUnits("10", 8));
            expect(isAlive).to.be.true;
        });
    });
    
    describe("getAssetPrice", function () {
        it("Should return price if alive", async function () {
            const { lpOracle, curvePool, usdc, oracleAggregator, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const usdcAddress = await usdc.getAddress();
            
            await lpOracle.connect(manager).setLPConfig(lpToken, lpToken, usdcAddress);
            await curvePool.setVirtualPrice(ethers.parseUnits("1.2", 18));
            await oracleAggregator.setAssetPrice(usdcAddress, ethers.parseUnits("1", 8));
            
            const price = await lpOracle.getAssetPrice(lpToken);
            expect(price).to.equal(ethers.parseUnits("1.2", 8));
        });
        
        it("Should revert if price not alive", async function () {
            const { lpOracle, curvePool, usdc, oracleAggregator, manager } = await loadFixture(deployFixture);
            
            const lpToken = await curvePool.getAddress();
            const usdcAddress = await usdc.getAddress();
            
            await lpOracle.connect(manager).setLPConfig(lpToken, lpToken, usdcAddress);
            await oracleAggregator.setAssetAlive(usdcAddress, false);
            
            await expect(
                lpOracle.getAssetPrice(lpToken)
            ).to.be.revertedWithCustomError(lpOracle, "PriceIsZero");
        });
    });
    
    describe("Access Control", function () {
        it("Should only allow manager to set LP config", async function () {
            const { lpOracle, curvePool, usdc, user } = await loadFixture(deployFixture);
            
            await expect(
                lpOracle.connect(user).setLPConfig(
                    await curvePool.getAddress(),
                    await curvePool.getAddress(),
                    await usdc.getAddress()
                )
            ).to.be.reverted;
        });
        
        it("Should only allow manager to remove LP config", async function () {
            const { lpOracle, curvePool, user } = await loadFixture(deployFixture);
            
            await expect(
                lpOracle.connect(user).removeLPConfig(await curvePool.getAddress())
            ).to.be.reverted;
        });
        
        it("Should allow admin to grant manager role", async function () {
            const { lpOracle, owner, user, ORACLE_MANAGER_ROLE } = await loadFixture(deployFixture);
            
            await lpOracle.connect(owner).grantRole(ORACLE_MANAGER_ROLE, user.address);
            expect(await lpOracle.hasRole(ORACLE_MANAGER_ROLE, user.address)).to.be.true;
        });
    });
});