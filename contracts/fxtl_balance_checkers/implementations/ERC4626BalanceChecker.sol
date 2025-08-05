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
import "../../vaults/atoken_wrapper/interfaces/IERC4626.sol";

/// @notice Error thrown when a token is not a valid ERC4626 vault
error InvalidERC4626Token(address token);

/**
 * @title ERC4626BalanceChecker
 * @author dTrinity
 * @notice Contract for checking balances of ERC4626 vault tokens
 * @dev For ERC4626 tokens, the balance is calculated by converting shares to underlying assets
 *      using the ERC4626 convertToAssets() function. No debt calculation is needed
 *      since ERC4626 tokens represent direct vault shares.
 */
contract ERC4626BalanceChecker is BaseBalanceChecker {
    /// @notice The primary vault token address (ERC4626 vault)
    address public immutable VAULT_TOKEN;

    /**
     * @param initialAdmin The address that will be granted the DEFAULT_ADMIN_ROLE
     * @param vaultToken The address of the primary vault token (ERC4626 vault)
     */
    constructor(address initialAdmin, address vaultToken) {
        if (initialAdmin == address(0)) {
            revert InvalidAddress(initialAdmin);
        }
        if (vaultToken == address(0)) {
            revert InvalidAddress(vaultToken);
        }

        VAULT_TOKEN = vaultToken;
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);

        // Map the vault token to itself for direct queries
        externalSourceToInternalToken[vaultToken] = vaultToken;
    }

    /**
     * @notice Get the vault token address
     * @return The vault token address
     */
    function vaultToken() external view returns (address) {
        return VAULT_TOKEN;
    }

    /**
     * @dev Internal helper function to validate token and get necessary details
     * @param token The token address to validate
     * @return validToken The validated token address (vault token)
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
        address mappedVaultToken = externalSourceToInternalToken[token];
        isExternalToken =
            mappedVaultToken != address(0) &&
            mappedVaultToken != token;
        validToken = isExternalToken ? mappedVaultToken : token;

        // Validate that the token is a valid ERC4626 vault
        try IERC4626(validToken).asset() returns (address) {
            // Token is valid ERC4626
        } catch {
            if (isExternalToken) {
                revert InvalidERC4626Token(mappedVaultToken);
            } else {
                revert ExternalTokenNotMapped(originalToken);
            }
        }
    }

    /**
     * @dev Calculates the balance for a single token and address
     * @param token The token address
     * @param user The user address
     * @return The calculated balance (normalized to 18 decimals)
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

        uint256 balance;

        if (isExternalToken) {
            // For external tokens, get balance directly
            balance = IERC20(originalToken).balanceOf(user);
        } else {
            // For vault tokens, get shares and convert to assets
            uint256 shares = IERC20(validToken).balanceOf(user);
            if (shares > 0) {
                // Convert shares to underlying assets using ERC4626
                balance = IERC4626(validToken).convertToAssets(shares);
            } else {
                balance = 0;
            }
        }

        // Get decimals for normalization
        uint256 tokenDecimals = isExternalToken
            ? _getTokenDecimals(originalToken)
            : _getTokenDecimals(validToken);

        // Normalize to 18 decimals
        return _normalizeToDecimals18(balance, tokenDecimals);
    }

    /**
     * @notice Get the underlying asset address for a given vault token
     * @param vaultToken The vault token address
     * @return The underlying asset address
     */
    function getUnderlyingAsset(
        address vaultToken
    ) external view returns (address) {
        return IERC4626(vaultToken).asset();
    }

    /**
     * @notice Convert vault shares to underlying asset amount
     * @param vaultToken The vault token address
     * @param shares The amount of shares to convert
     * @return The equivalent amount of underlying assets
     */
    function convertSharesToAssets(
        address vaultToken,
        uint256 shares
    ) external view returns (uint256) {
        return IERC4626(vaultToken).convertToAssets(shares);
    }

    /**
     * @notice Convert underlying asset amount to vault shares
     * @param vaultToken The vault token address
     * @param assets The amount of assets to convert
     * @return The equivalent amount of shares
     */
    function convertAssetsToShares(
        address vaultToken,
        uint256 assets
    ) external view returns (uint256) {
        return IERC4626(vaultToken).convertToShares(assets);
    }

    /**
     * @notice Get the total assets managed by a vault
     * @param vaultToken The vault token address
     * @return The total amount of underlying assets managed by the vault
     */
    function getTotalAssets(
        address vaultToken
    ) external view returns (uint256) {
        return IERC4626(vaultToken).totalAssets();
    }

    /**
     * @notice Get the total supply of vault shares
     * @param vaultToken The vault token address
     * @return The total supply of vault shares
     */
    function getTotalSupply(
        address vaultToken
    ) external view returns (uint256) {
        return IERC20(vaultToken).totalSupply();
    }
}
