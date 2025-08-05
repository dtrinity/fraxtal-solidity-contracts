// SPDX-License-Identifier: BUSL-1.1
/* ———————————————————————————————————————————————————————————————————————————————— *
 *    _____     ______   ______     __     __   __     __     ______   __  __       *
 *   /\  __-.  /\__  _\ /\  == \   /\ \   /\ "-.\ \   /\ \   /\__  _\ /\ \_\ \      *
 *   \ \ \/\ \ \/_/\ \/ \ \  __<   \ \ \  \ \ \-.  \  \ \ \  \/_/\ \/ \ \____ \     *
 *    \ \____-    \ \_\  \ \_\ \_\  \ \_\  \ \_\\"\_\  \ \_\    \ \_\  \/\_____\    *
 *     \/____/     \/_/   \/_/ /_/   \/_/   \/_/ \/_/   \/_/     \/_/   \/_____/    *
 *                                                                                  *
 * ————————————————————————————————— dtrinity.org ————————————————————————————————— *
 *                                                                                  *
 *                                         ▲                                        *
 *                                        ▲ ▲                                       *
 *                                                                                  *
 * ———————————————————————————————————————————————————————————————————————————————— *
 * dTRINITY Protocol: https://github.com/dtrinity                                   *
 * ———————————————————————————————————————————————————————————————————————————————— */

pragma solidity ^0.8.20;

import "../base/BaseBalanceChecker.sol";
import "../../lending/core/interfaces/IPool.sol";
import "../../lending/core/protocol/libraries/types/DataTypes.sol";

/// @notice Error thrown when a debt token is invalid or not found
error InvalidDebtToken(address token);

/// @notice Error thrown when a token is not a valid dToken
error InvalidDToken(address token);

/**
 * @title DLendBalanceChecker
 * @author dTrinity
 * @notice Contract for checking effective balances of dLEND tokens
 * @dev The effective balance is the portion of a user's position which is not borrowed against,
 *      calculated as: userBalance * (totalSupply - totalDebt) / totalSupply
 */
contract DLendBalanceChecker is BaseBalanceChecker {
    /// @notice The Pool contract address
    IPool public immutable POOL;

    /**
     * @param pool The address of the Pool contract
     */
    constructor(address pool) {
        if (pool == address(0)) {
            revert InvalidAddress(pool);
        }
        POOL = IPool(pool);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Internal helper function to validate token and get necessary details
     * @param token The token address to validate
     * @return validToken The validated token address (dToken)
     * @return originalToken The original token address
     * @return isExternalToken Whether the token is external
     */
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
        address mappedDToken = externalSourceToInternalToken[token];
        isExternalToken = mappedDToken != address(0);
        validToken = isExternalToken ? mappedDToken : token;

        // Simple validation - check if it's a contract with reserves in the pool
        try POOL.getReserveData(validToken) returns (
            DataTypes.ReserveData memory
        ) {
            // Valid token if it has reserve data
        } catch {
            if (isExternalToken) {
                revert InvalidDToken(mappedDToken);
            } else {
                revert ExternalTokenNotMapped(originalToken);
            }
        }
    }

    /**
     * @dev Calculates the effective balance for a single token and address
     * @param token The token address
     * @param user The user address
     * @return The calculated effective balance (normalized to 18 decimals)
     */
    function _calculateTokenBalance(
        address token,
        address user
    ) internal view override returns (uint256) {
        // Validate token and get necessary details
        (
            address validToken,
            address originalToken,
            bool isExternalToken
        ) = _validateTokenAndGetDetails(token);

        // For dLEND tokens, we need to find the underlying asset by checking pool reserve data
        // Since we validated that validToken has reserve data, we can use it directly
        DataTypes.ReserveData memory reserveData = POOL.getReserveData(
            validToken
        );
        address aToken = reserveData.aTokenAddress;
        address debtToken = reserveData.variableDebtTokenAddress;

        if (aToken == address(0) || debtToken == address(0)) {
            revert InvalidDebtToken(validToken);
        }

        // Get total supply and debt using IERC20 interface
        uint256 totalSupply = IERC20(aToken).totalSupply();
        if (totalSupply == 0) return 0;

        uint256 totalDebt = IERC20(debtToken).totalSupply();

        // In case we are fully maxed out or have accrued bad debt
        if (totalDebt >= totalSupply) return 0;

        // Calculate ratio of available supply (not borrowed)
        uint256 ratio = ((totalSupply - totalDebt) * 1e18) / totalSupply;

        // Get balance based on token type
        uint256 balance = isExternalToken
            ? IERC20(originalToken).balanceOf(user)
            : IERC20(aToken).balanceOf(user);

        // Apply utilization ratio
        uint256 effectiveBalance = (balance * ratio) / 1e18;

        // Get decimals for normalization
        uint256 decimals = isExternalToken
            ? IERC20Metadata(originalToken).decimals()
            : IERC20Metadata(aToken).decimals();

        // Normalize to 18 decimals
        return _normalizeToDecimals18(effectiveBalance, decimals);
    }

    /**
     * @notice Get the underlying asset address for a given dToken
     * @param underlyingAsset The underlying asset address
     * @return The underlying asset address (same as input for dLEND)
     */
    function getUnderlyingAsset(
        address underlyingAsset
    ) external view returns (address) {
        return underlyingAsset;
    }

    /**
     * @notice Get the debt token address for a given underlying asset
     * @param underlyingAsset The underlying asset address
     * @return The debt token address
     */
    function getDebtToken(
        address underlyingAsset
    ) external view returns (address) {
        return POOL.getReserveData(underlyingAsset).variableDebtTokenAddress;
    }

    /**
     * @notice Get the utilization ratio for a given underlying asset
     * @param underlyingAsset The underlying asset address
     * @return The utilization ratio (1e18 = 100%)
     */
    function getUtilizationRatio(
        address underlyingAsset
    ) external view returns (uint256) {
        DataTypes.ReserveData memory reserveData = POOL.getReserveData(
            underlyingAsset
        );
        address aToken = reserveData.aTokenAddress;
        address debtToken = reserveData.variableDebtTokenAddress;

        if (aToken == address(0) || debtToken == address(0)) {
            revert InvalidDebtToken(underlyingAsset);
        }

        uint256 totalSupply = IERC20(aToken).totalSupply();
        if (totalSupply == 0) return 0;

        uint256 totalDebt = IERC20(debtToken).totalSupply();

        // In case we are fully maxed out or have accrued bad debt
        if (totalDebt >= totalSupply) return 1e18; // 100% utilization

        return (totalDebt * 1e18) / totalSupply;
    }

    /**
     * @notice Get the available ratio (portion not borrowed) for a given underlying asset
     * @param underlyingAsset The underlying asset address
     * @return The available ratio (1e18 = 100%)
     */
    function getAvailableRatio(
        address underlyingAsset
    ) external view returns (uint256) {
        uint256 utilizationRatio = this.getUtilizationRatio(underlyingAsset);
        return 1e18 - utilizationRatio;
    }

    /**
     * @notice Get the pool address
     * @return The pool address
     */
    function pool() external view returns (address) {
        return address(POOL);
    }
}
