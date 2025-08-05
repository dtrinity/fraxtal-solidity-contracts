// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "../implementations/ERC4626BalanceChecker.sol";
import "./MockERC4626.sol";
import "../../test/MockERC20.sol";

/**
 * @title ERC4626BalanceCheckerTest
 * @notice Test contract for ERC4626BalanceChecker functionality
 */
contract ERC4626BalanceCheckerTest {
    ERC4626BalanceChecker public balanceChecker;
    MockERC4626 public vault;
    MockERC20 public asset;
    MockERC20 public externalToken;

    address public admin = address(1);
    address public user1 = address(2);
    address public user2 = address(3);

    event TestResult(string testName, bool passed);

    constructor() {
        // Deploy mock tokens
        asset = new MockERC20("Asset", "AST", 18);
        externalToken = new MockERC20("External", "EXT", 6);
        
        // Deploy mock vault
        vault = new MockERC4626("Vault", "VLT", address(asset));
        
        // Deploy balance checker
        balanceChecker = new ERC4626BalanceChecker(admin, address(vault));
        
        // Setup initial state
        asset.mint(address(vault), 1000e18);
        vault.setTotalAssets(1000e18);
        
        // Mint some shares to users
        vault.mintShares(user1, 100e18); // 100 shares to user1
        vault.mintShares(user2, 50e18);  // 50 shares to user2
        
        // Mint external tokens to users
        externalToken.mint(user1, 1000e6); // 1000 tokens (6 decimals)
        externalToken.mint(user2, 500e6);  // 500 tokens (6 decimals)
    }

    function testTokenBalances() external {
        address[] memory addresses = new address[](2);
        addresses[0] = user1;
        addresses[1] = user2;

        uint256[] memory balances = balanceChecker.tokenBalances(address(vault), addresses);
        
        // User1 has 100 shares, vault has 1000 assets and 150 total shares
        // So user1 should have (100 * 1000) / 150 = 666.666... assets ≈ 666666666666666666666 (18 decimals)
        bool test1 = balances[0] > 666e18 && balances[0] < 667e18;
        
        // User2 has 50 shares, so should have (50 * 1000) / 150 = 333.333... assets ≈ 333333333333333333333 (18 decimals)
        bool test2 = balances[1] > 333e18 && balances[1] < 334e18;
        
        emit TestResult("testTokenBalances", test1 && test2);
    }

    function testExternalTokenMapping() external {
        // Map external token to vault
        balanceChecker.mapExternalSource(address(externalToken), address(vault));
        
        address[] memory addresses = new address[](2);
        addresses[0] = user1;
        addresses[1] = user2;

        uint256[] memory balances = balanceChecker.tokenBalances(address(externalToken), addresses);
        
        // External token balances should be normalized to 18 decimals
        // User1: 1000e6 -> 1000e18, User2: 500e6 -> 500e18
        bool test1 = balances[0] == 1000e18;
        bool test2 = balances[1] == 500e18;
        
        emit TestResult("testExternalTokenMapping", test1 && test2);
    }

    function testBatchTokenBalances() external {
        // Map external token to vault
        balanceChecker.mapExternalSource(address(externalToken), address(vault));
        
        address[] memory sources = new address[](2);
        sources[0] = address(vault);
        sources[1] = address(externalToken);
        
        address[] memory addresses = new address[](2);
        addresses[0] = user1;
        addresses[1] = user2;

        uint256[] memory balances = balanceChecker.batchTokenBalances(sources, addresses);
        
        // Should be sum of vault balances + external token balances
        // User1: ~666e18 + 1000e18 ≈ 1666e18
        // User2: ~333e18 + 500e18 ≈ 833e18
        bool test1 = balances[0] > 1666e18 && balances[0] < 1667e18;
        bool test2 = balances[1] > 833e18 && balances[1] < 834e18;
        
        emit TestResult("testBatchTokenBalances", test1 && test2);
    }

    function testUtilityFunctions() external {
        address underlyingAsset = balanceChecker.getUnderlyingAsset(address(vault));
        uint256 sharesToAssets = balanceChecker.convertSharesToAssets(address(vault), 100e18);
        uint256 assetsToShares = balanceChecker.convertAssetsToShares(address(vault), 666e18);
        uint256 totalAssets = balanceChecker.getTotalAssets(address(vault));
        uint256 totalSupply = balanceChecker.getTotalSupply(address(vault));
        
        bool test1 = underlyingAsset == address(asset);
        bool test2 = sharesToAssets > 666e18 && sharesToAssets < 667e18; // 100 shares ≈ 666.67 assets
        bool test3 = assetsToShares == 100e18; // 666 assets ≈ 100 shares (rounded)
        bool test4 = totalAssets == 1000e18;
        bool test5 = totalSupply == 150e18; // 100 + 50 shares minted
        
        emit TestResult("testUtilityFunctions", test1 && test2 && test3 && test4 && test5);
    }

    function testInvalidToken() external {
        address[] memory addresses = new address[](1);
        addresses[0] = user1;
        
        try balanceChecker.tokenBalances(address(asset), addresses) {
            emit TestResult("testInvalidToken", false); // Should have reverted
        } catch {
            emit TestResult("testInvalidToken", true); // Expected to revert
        }
    }

    function runAllTests() external {
        testTokenBalances();
        testExternalTokenMapping();
        testBatchTokenBalances();
        testUtilityFunctions();
        testInvalidToken();
    }
}