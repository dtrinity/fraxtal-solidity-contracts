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
import "../../lending/core/interfaces/IAToken.sol";
import "../../lending/core/interfaces/IVariableDebtToken.sol";
import "../../lending/core/interfaces/IPool.sol";
import "../../lending/core/protocol/libraries/types/DataTypes.sol";
import {IERC20Detailed} from "../../lending/core/dependencies/openzeppelin/contracts/IERC20Detailed.sol";

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

        // Validate that the token is a valid dToken
        try IAToken(validToken).UNDERLYING_ASSET_ADDRESS() returns (address) {
            // Token is valid dToken
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

        // Get underlying asset and debt token
        address underlyingAsset = IAToken(validToken).UNDERLYING_ASSET_ADDRESS();
        address debtToken = POOL.getReserveData(underlyingAsset).variableDebtTokenAddress;
        
        if (debtToken == address(0)) {
            revert InvalidDebtToken(validToken);
        }

        // Get total supply and debt using unscaled values for ratio calculation
        uint256 totalSupply = IAToken(validToken).totalSupply();
        if (totalSupply == 0) return 0;

        uint256 totalDebt = IERC20(debtToken).totalSupply();

        // In case we are fully maxed out or have accrued bad debt
        if (totalDebt >= totalSupply) return 0;

        // Calculate ratio of available supply (not borrowed)
        uint256 ratio = ((totalSupply - totalDebt) * 1e18) / totalSupply;

        // Get balance based on token type
        uint256 balance = isExternalToken
            ? IERC20(originalToken).balanceOf(user)
            : IAToken(validToken).balanceOf(user);

        // Apply utilization ratio
        uint256 effectiveBalance = (balance * ratio) / 1e18;

        // Get decimals for normalization
        uint256 decimals = isExternalToken
            ? IERC20Detailed(originalToken).decimals()
            : IERC20Detailed(validToken).decimals(); // All aTokens are also detailed

        // Normalize to 18 decimals
        return _normalizeToDecimals18(effectiveBalance, decimals);
    }

    /**
     * @notice Get the underlying asset address for a given dToken
     * @param dToken The dToken address
     * @return The underlying asset address
     */
    function getUnderlyingAsset(address dToken) external view returns (address) {
        return IAToken(dToken).UNDERLYING_ASSET_ADDRESS();
    }

    /**
     * @notice Get the debt token address for a given dToken
     * @param dToken The dToken address
     * @return The debt token address
     */
    function getDebtToken(address dToken) external view returns (address) {
        address underlyingAsset = IAToken(dToken).UNDERLYING_ASSET_ADDRESS();
        return POOL.getReserveData(underlyingAsset).variableDebtTokenAddress;
    }

    /**
     * @notice Get the utilization ratio for a given dToken
     * @param dToken The dToken address
     * @return The utilization ratio (1e18 = 100%)
     */
    function getUtilizationRatio(address dToken) external view returns (uint256) {
        address underlyingAsset = IAToken(dToken).UNDERLYING_ASSET_ADDRESS();
        address debtToken = POOL.getReserveData(underlyingAsset).variableDebtTokenAddress;
        
        if (debtToken == address(0)) {
            revert InvalidDebtToken(dToken);
        }

        uint256 totalSupply = IAToken(dToken).totalSupply();
        if (totalSupply == 0) return 0;

        uint256 totalDebt = IERC20(debtToken).totalSupply();
        
        // In case we are fully maxed out or have accrued bad debt
        if (totalDebt >= totalSupply) return 1e18; // 100% utilization

        return (totalDebt * 1e18) / totalSupply;
    }

    /**
     * @notice Get the available ratio (portion not borrowed) for a given dToken
     * @param dToken The dToken address
     * @return The available ratio (1e18 = 100%)
     */
    function getAvailableRatio(address dToken) external view returns (uint256) {
        uint256 utilizationRatio = this.getUtilizationRatio(dToken);
        return 1e18 - utilizationRatio;
    }
}