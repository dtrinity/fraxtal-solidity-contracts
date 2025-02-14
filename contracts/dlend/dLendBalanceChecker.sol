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

import "./interfaces/IBalanceChecker.sol";
import "../lending/core/interfaces/IAToken.sol";
import "../lending/core/interfaces/IVariableDebtToken.sol";
import "../lending/core/interfaces/IPool.sol";
import "../lending/core/protocol/libraries/types/DataTypes.sol";
import "@openzeppelin/contracts-5/access/AccessControl.sol";
import {IERC20Detailed} from "../lending/core/dependencies/openzeppelin/contracts/IERC20Detailed.sol";

/// @notice Error thrown when trying to get balances for an external token that isn't mapped to a dToken
error ExternalTokenNotMapped(address externalToken);

/// @notice Error thrown when a debt token is invalid or not found
error InvalidDebtToken(address token);

/// @notice Error thrown when a token is not a valid dToken
error InvalidDToken(address token);

/**
 * @title dLendBalanceChecker
 * @author dTrinity
 * @notice Contract for checking effective balances of dLEND tokens
 * @dev The effective balance is the portion of a user's position which is not borrowed against,
 *      calculated as: userBalance * (totalSupply - totalDebt) / totalSupply
 */
contract dLendBalanceChecker is IBalanceChecker, AccessControl {
    /// @notice The Pool contract address
    IPool public immutable POOL;

    /// @notice Mapping from external token to its corresponding dToken
    mapping(address => address) public externalSourceToDToken;

    // No events needed - this is a view function

    /**
     * @param pool The address of the Pool contract
     */
    constructor(address pool) {
        require(pool != address(0), "INVALID_POOL_ADDRESS");
        POOL = IPool(pool);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Maps an external token to its corresponding dToken
     * @param externalToken The address of the external token
     * @param dToken The address of the corresponding dToken
     */
    function mapExternalSource(
        address externalToken,
        address dToken
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(dToken != address(0), "INVALID_DTOKEN_ADDRESS");
        externalSourceToDToken[externalToken] = dToken;
    }

    /**
     * @dev Internal helper function to validate token and get necessary details
     * @param token The token address to validate
     * @return validToken The validated token address (dToken)
     * @return originalToken The original token address
     * @return isExternalToken Whether the token is external
     * @return underlyingAsset The underlying asset address
     * @return debtToken The associated debt token address
     */
    function _validateTokenAndGetDetails(
        address token
    )
        internal
        view
        returns (
            address validToken,
            address originalToken,
            bool isExternalToken,
            address underlyingAsset,
            address debtToken
        )
    {
        originalToken = token;
        address mappedDToken = externalSourceToDToken[token];
        isExternalToken = mappedDToken != address(0);
        validToken = isExternalToken ? mappedDToken : token;

        try IAToken(validToken).UNDERLYING_ASSET_ADDRESS() returns (
            address asset
        ) {
            underlyingAsset = asset;
        } catch {
            if (isExternalToken) {
                revert InvalidDToken(mappedDToken);
            } else {
                revert ExternalTokenNotMapped(originalToken);
            }
        }

        debtToken = POOL
            .getReserveData(underlyingAsset)
            .variableDebtTokenAddress;
        if (debtToken == address(0)) {
            revert InvalidDebtToken(validToken);
        }
    }

    function tokenBalances(
        address token,
        address[] memory addresses
    ) external view override returns (uint256[] memory result) {
        result = new uint256[](addresses.length);

        // Validate token and get necessary details
        (
            address validToken,
            address originalToken,
            bool isExternalToken, // underlyingAsset not needed after validation
            ,
            address debtToken
        ) = _validateTokenAndGetDetails(token);

        // Get total supply and debt using unscaled values for ratio calculation
        uint256 totalSupply = IAToken(validToken).totalSupply();
        if (totalSupply == 0) return result;

        uint256 totalDebt = IERC20(debtToken).totalSupply();

        // In case we are fully maxed out or have accrued bad debt
        if (totalDebt >= totalSupply) return result;

        // Calculate ratio of available supply (not borrowed)
        uint256 ratio = ((totalSupply - totalDebt) * 1e18) / totalSupply;

        // Get decimals for normalization
        uint256 decimals = isExternalToken
            ? IERC20Detailed(originalToken).decimals()
            : IERC20Detailed(validToken).decimals(); // All aTokens are also detailed

        // Calculate effective balance for each address using the original token
        for (uint256 i = 0; i < addresses.length; i++) {
            // Get balance based on token type
            uint256 balance = isExternalToken
                ? IERC20(originalToken).balanceOf(addresses[i])
                : IAToken(validToken).balanceOf(addresses[i]);

            // First apply utilization ratio
            uint256 effectiveBalance = (balance * ratio) / 1e18;

            // Then normalize to 18 decimals
            if (decimals < 18) {
                effectiveBalance = effectiveBalance * (10 ** (18 - decimals));
            } else if (decimals > 18) {
                effectiveBalance = effectiveBalance / (10 ** (decimals - 18));
            }

            result[i] = effectiveBalance;
        }
    }

    /**
     * @inheritdoc IBalanceChecker
     */
    function batchTokenBalances(
        address[] memory sources,
        address[] memory addresses
    ) external view override returns (uint256[] memory result) {
        require(sources.length > 0, "NO_SOURCES_PROVIDED");

        result = new uint256[](addresses.length);

        // Process each source token
        for (uint256 i = 0; i < sources.length; i++) {
            // Skip underlying tokens (ZeroAddress)
            if (sources[i] == address(0)) {
                continue;
            }

            try this.tokenBalances(sources[i], addresses) returns (
                uint256[] memory balances
            ) {
                // Add balances from this source to the running total
                for (uint256 j = 0; j < addresses.length; j++) {
                    result[j] += balances[j];
                }
            } catch {
                // Skip invalid sources silently as per original behavior
                continue;
            }
        }
    }
}
