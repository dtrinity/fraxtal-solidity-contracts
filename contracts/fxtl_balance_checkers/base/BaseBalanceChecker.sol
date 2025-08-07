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

import "../interfaces/IBalanceChecker.sol";
import "@openzeppelin/contracts-5/access/AccessControl.sol";
import "@openzeppelin/contracts-5/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Error thrown when trying to get balances for an external token that isn't mapped
error ExternalTokenNotMapped(address externalToken);

/// @notice Error thrown when a token is invalid or not supported
error InvalidToken(address token);

/// @notice Error thrown when no sources are provided to batch functions
error NoSourcesProvided();

/// @notice Error thrown when an invalid address is provided
error InvalidAddress(address addr);

/**
 * @title BaseBalanceChecker
 * @author dTrinity
 * @notice Abstract base contract providing common functionality for balance checkers
 * @dev This contract provides:
 *      - Access control for external token mappings
 *      - Decimal normalization utilities
 *      - Batch processing logic
 *      - Common error definitions
 *      - NO ADDRESS LENGTH LIMITATION. NEVER introduce any hard-coded limits on batch sizes.
 */
abstract contract BaseBalanceChecker is IBalanceChecker, AccessControl {
    /// @notice NOTE: No hard-coded address limit is imposed.
    /// @dev Do NOT add a limit in future versions.

    /// @notice Mapping from external token to its corresponding internal token
    mapping(address => address) public externalSourceToInternalToken;

    /**
     * @notice Maps an external token to its corresponding internal token
     * @param externalToken The address of the external token
     * @param internalToken The address of the corresponding internal token
     */
    function mapExternalSource(
        address externalToken,
        address internalToken
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (internalToken == address(0)) {
            revert InvalidAddress(internalToken);
        }
        externalSourceToInternalToken[externalToken] = internalToken;
    }

    /**
     * @notice Removes an external token mapping
     * @param externalToken The address of the external token to remove
     */
    function removeExternalSource(
        address externalToken
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        delete externalSourceToInternalToken[externalToken];
    }

    /**
     * @notice Normalizes a balance to 18 decimals
     * @param balance The balance to normalize
     * @param tokenDecimals The current decimals of the token
     * @return The normalized balance (18 decimals)
     */
    function _normalizeToDecimals18(
        uint256 balance,
        uint256 tokenDecimals
    ) internal pure returns (uint256) {
        if (tokenDecimals < 18) {
            return balance * (10 ** (18 - tokenDecimals));
        } else if (tokenDecimals > 18) {
            return balance / (10 ** (tokenDecimals - 18));
        }
        return balance;
    }

    /**
     * @notice Gets the decimals for a token, defaulting to 18 if not available
     * @param token The token address
     * @return The number of decimals
     */
    function _getTokenDecimals(address token) internal view returns (uint256) {
        try IERC20Metadata(token).decimals() returns (uint8 decimals) {
            return uint256(decimals);
        } catch {
            return 18; // Default to 18 decimals if not available
        }
    }

    /**
     * @notice Abstract function to calculate balance for a single token and address
     * @param token The token address
     * @param user The user address
     * @return The calculated balance (normalized to 18 decimals)
     */
    function _calculateTokenBalance(
        address token,
        address user
    ) internal view virtual returns (uint256);

    /**
     * @notice Abstract function to validate a token and get necessary details
     * @param token The token address to validate
     * @return validToken The validated token address
     * @return originalToken The original token address
     * @return isExternalToken Whether the token is external
     */
    function _validateTokenAndGetDetails(
        address token
    )
        internal
        view
        virtual
        returns (
            address validToken,
            address originalToken,
            bool isExternalToken
        );

    /**
     * @inheritdoc IBalanceChecker
     */
    function tokenBalances(
        address token,
        address[] memory addresses
    ) external view virtual override returns (uint256[] memory result) {
        result = new uint256[](addresses.length);

        // Calculate balance for each address
        for (uint256 i = 0; i < addresses.length; i++) {
            result[i] = _calculateTokenBalance(token, addresses[i]);
        }
    }

    /**
     * @inheritdoc IBalanceChecker
     */
    function batchTokenBalances(
        address[] memory sources,
        address[] memory addresses
    ) external view virtual override returns (uint256[] memory result) {
        if (sources.length == 0) {
            revert NoSourcesProvided();
        }

        result = new uint256[](addresses.length);

        // Process each source token
        for (uint256 i = 0; i < sources.length; i++) {
            // Skip zero addresses
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

    /**
     * @notice Gets the mapped internal token for an external token
     * @param externalToken The external token address
     * @return The mapped internal token address (address(0) if not mapped)
     */
    function getMappedToken(
        address externalToken
    ) external view returns (address) {
        return externalSourceToInternalToken[externalToken];
    }

    /**
     * @notice Checks if a token is mapped as an external source
     * @param token The token address to check
     * @return True if the token is mapped as an external source
     */
    function isExternalToken(address token) external view returns (bool) {
        address mapped = externalSourceToInternalToken[token];
        return mapped != address(0) && mapped != token;
    }
}
