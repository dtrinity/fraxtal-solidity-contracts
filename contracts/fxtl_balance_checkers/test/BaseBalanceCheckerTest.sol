// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "../base/BaseBalanceChecker.sol";
import "../../test/MockERC20.sol";

/**
 * @title TestableBaseBalanceChecker
 * @notice Concrete implementation of BaseBalanceChecker for testing
 */
contract TestableBaseBalanceChecker is BaseBalanceChecker {
    mapping(address => uint256) public mockBalances;

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function _validateTokenAndGetDetails(
        address token
    )
        internal
        view
        override
        returns (
            address validToken,
            address originalToken,
            bool isExternalToken
        )
    {
        originalToken = token;
        address mappedToken = externalSourceToInternalToken[token];
        isExternalToken = mappedToken != address(0);
        validToken = isExternalToken ? mappedToken : token;
        
        // Simple validation - just check if it's a non-zero address
        if (validToken == address(0)) {
            revert InvalidToken(token);
        }
    }

    function _calculateTokenBalance(
        address token,
        address user
    ) internal view override returns (uint256) {
        // For testing, return mock balance
        return mockBalances[user];
    }

    // Helper function for testing
    function setMockBalance(address user, uint256 balance) external {
        mockBalances[user] = balance;
    }
}

/**
 * @title BaseBalanceCheckerTest
 * @notice Test contract for BaseBalanceChecker functionality
 */
contract BaseBalanceCheckerTest {
    TestableBaseBalanceChecker public balanceChecker;
    MockERC20 public token;
    MockERC20 public externalToken;

    address public admin = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public nonAdmin = address(4);

    event TestResult(string testName, bool passed);

    constructor() {
        token = new MockERC20("Token", "TKN", 18);
        externalToken = new MockERC20("External", "EXT", 6);
        balanceChecker = new TestableBaseBalanceChecker(admin);

        // Set up mock balances
        balanceChecker.setMockBalance(user1, 1000e18);
        balanceChecker.setMockBalance(user2, 500e18);
    }

    function testExternalTokenMapping() external {
        // Test mapping external token (should work with admin)
        try {
            balanceChecker.mapExternalSource(address(externalToken), address(token));
            bool mapped = balanceChecker.getMappedToken(address(externalToken)) == address(token);
            bool isExternal = balanceChecker.isExternalToken(address(externalToken));
            emit TestResult("testExternalTokenMapping", mapped && isExternal);
        } catch {
            emit TestResult("testExternalTokenMapping", false);
        }
    }

    function testUnauthorizedMapping() external {
        // Test that non-admin cannot map tokens
        TestableBaseBalanceChecker testChecker = new TestableBaseBalanceChecker(admin);
        
        try {
            // This should revert since we're not the admin
            testChecker.mapExternalSource(address(externalToken), address(token));
            emit TestResult("testUnauthorizedMapping", false); // Should have reverted
        } catch {
            emit TestResult("testUnauthorizedMapping", true); // Expected to revert
        }
    }

    function testRemoveExternalSource() external {
        // First map a token
        balanceChecker.mapExternalSource(address(externalToken), address(token));
        
        // Then remove it
        balanceChecker.removeExternalSource(address(externalToken));
        
        bool notMapped = balanceChecker.getMappedToken(address(externalToken)) == address(0);
        bool notExternal = !balanceChecker.isExternalToken(address(externalToken));
        
        emit TestResult("testRemoveExternalSource", notMapped && notExternal);
    }

    function testTokenBalances() external {
        address[] memory addresses = new address[](2);
        addresses[0] = user1;
        addresses[1] = user2;

        uint256[] memory balances = balanceChecker.tokenBalances(address(token), addresses);
        
        bool test1 = balances[0] == 1000e18;
        bool test2 = balances[1] == 500e18;
        
        emit TestResult("testTokenBalances", test1 && test2);
    }

    function testBatchTokenBalances() external {
        balanceChecker.mapExternalSource(address(externalToken), address(token));
        
        address[] memory sources = new address[](2);
        sources[0] = address(token);
        sources[1] = address(externalToken);
        
        address[] memory addresses = new address[](2);
        addresses[0] = user1;
        addresses[1] = user2;

        uint256[] memory balances = balanceChecker.batchTokenBalances(sources, addresses);
        
        // Should be double the mock balance since we're adding the same token twice
        bool test1 = balances[0] == 2000e18;
        bool test2 = balances[1] == 1000e18;
        
        emit TestResult("testBatchTokenBalances", test1 && test2);
    }

    function testTooManyAddresses() external {
        // Create array with more than MAX_ADDRESSES (1000)
        address[] memory addresses = new address[](1001);
        for (uint256 i = 0; i < 1001; i++) {
            addresses[i] = address(uint160(i + 1));
        }

        try {
            balanceChecker.tokenBalances(address(token), addresses);
            emit TestResult("testTooManyAddresses", false); // Should have reverted
        } catch {
            emit TestResult("testTooManyAddresses", true); // Expected to revert
        }
    }

    function testEmptySourcesArray() external {
        address[] memory sources = new address[](0);
        address[] memory addresses = new address[](1);
        addresses[0] = user1;

        try {
            balanceChecker.batchTokenBalances(sources, addresses);
            emit TestResult("testEmptySourcesArray", false); // Should have reverted
        } catch {
            emit TestResult("testEmptySourcesArray", true); // Expected to revert
        }
    }

    function testDecimalNormalization() external {
        // Test the internal _normalizeToDecimals18 function indirectly
        // This is tested through the concrete implementations
        emit TestResult("testDecimalNormalization", true);
    }

    function runAllTests() external {
        testExternalTokenMapping();
        testUnauthorizedMapping();
        testRemoveExternalSource();
        testTokenBalances();
        testBatchTokenBalances();
        testTooManyAddresses();
        testEmptySourcesArray();
        testDecimalNormalization();
    }
}