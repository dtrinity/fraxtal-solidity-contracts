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

import "../../dlend/interfaces/IBalanceChecker.sol";
import "../atoken_wrapper/interfaces/IERC4626.sol";
import "@openzeppelin/contracts-5/access/AccessControl.sol";
import "@openzeppelin/contracts-5/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Error thrown when trying to get balances for an external token that isn't mapped to an sdUSD token
error ExternalTokenNotMapped(address externalToken);

/// @notice Error thrown when a token is not a valid ERC4626 vault
error InvalidERC4626Token(address token);

/**
 * @title sdUSDBalanceChecker
 * @author dTrinity
 * @notice Contract for checking balances of sdUSD tokens (ERC4626 vaults)
 * @dev For sdUSD, the balance is calculated by converting shares to underlying assets
 *      using the ERC4626 convertToAssets() function. No debt calculation is needed
 *      unlike dLEND tokens since sdUSD represents direct vault shares.
 */
contract sdUSDBalanceChecker is IBalanceChecker, AccessControl {
    /// @notice The sdUSD token address (ERC4626 vault)
    address public immutable SD_USD_TOKEN;

    /// @notice Mapping from external token to its corresponding sdUSD token
    mapping(address => address) public externalSourceToSdUSDToken;

    /**
     * @param initialAdmin The address that will be granted the DEFAULT_ADMIN_ROLE
     * @param sdUSDToken The address of the sdUSD token (ERC4626 vault)
     */
    constructor(address initialAdmin, address sdUSDToken) {
        require(initialAdmin != address(0), "INVALID_ADMIN_ADDRESS");
        require(sdUSDToken != address(0), "INVALID_SDUSD_TOKEN_ADDRESS");

        SD_USD_TOKEN = sdUSDToken;
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);

        // Map the sdUSD token to itself for direct queries
        externalSourceToSdUSDToken[sdUSDToken] = sdUSDToken;
    }

    /**
     * @notice Maps an external token to its corresponding sdUSD token
     * @param externalToken The address of the external token
     * @param sdUSDToken The address of the corresponding sdUSD token (should be ERC4626 compliant)
     */
    function mapExternalSource(
        address externalToken,
        address sdUSDToken
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(sdUSDToken != address(0), "INVALID_SDUSD_TOKEN_ADDRESS");
        externalSourceToSdUSDToken[externalToken] = sdUSDToken;
    }

    /**
     * @dev Internal helper function to validate token and get necessary details
     * @param token The token address to validate
     * @return validToken The validated token address (sdUSD token)
     * @return originalToken The original token address
     * @return isExternalToken Whether the token is external
     * @return underlyingAsset The underlying asset address from the ERC4626 vault
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
            address underlyingAsset
        )
    {
        originalToken = token;
        address mappedSdUSDToken = externalSourceToSdUSDToken[token];
        isExternalToken =
            mappedSdUSDToken != address(0) &&
            mappedSdUSDToken != token;
        validToken = isExternalToken ? mappedSdUSDToken : token;

        try IERC4626(validToken).asset() returns (address asset) {
            underlyingAsset = asset;
        } catch {
            if (isExternalToken) {
                revert InvalidERC4626Token(mappedSdUSDToken);
            } else {
                revert ExternalTokenNotMapped(originalToken);
            }
        }
    }

    /**
     * @inheritdoc IBalanceChecker
     */
    function tokenBalances(
        address token,
        address[] memory addresses
    ) external view override returns (uint256[] memory result) {
        result = new uint256[](addresses.length);

        // Validate token and get necessary details
        (
            address validToken,
            address originalToken,
            bool isExternalToken,
            address underlyingAsset
        ) = _validateTokenAndGetDetails(token);

        // Get decimals for normalization
        uint256 tokenDecimals = isExternalToken
            ? IERC20Metadata(originalToken).decimals()
            : IERC20Metadata(validToken).decimals();

        // Calculate balance for each address using ERC4626 conversion
        for (uint256 i = 0; i < addresses.length; i++) {
            uint256 balance;

            if (isExternalToken) {
                // For external tokens, get balance directly
                balance = IERC20(originalToken).balanceOf(addresses[i]);
            } else {
                // For sdUSD tokens, get shares and convert to assets
                uint256 shares = IERC20(validToken).balanceOf(addresses[i]);
                if (shares > 0) {
                    // Convert shares to underlying assets using ERC4626
                    balance = IERC4626(validToken).convertToAssets(shares);
                } else {
                    balance = 0;
                }
            }

            // Normalize to 18 decimals
            if (tokenDecimals < 18) {
                balance = balance * (10 ** (18 - tokenDecimals));
            } else if (tokenDecimals > 18) {
                balance = balance / (10 ** (tokenDecimals - 18));
            }

            result[i] = balance;
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
     * @notice Get the underlying asset address for a given sdUSD token
     * @param sdUSDToken The sdUSD token address
     * @return The underlying asset address
     */
    function getUnderlyingAsset(
        address sdUSDToken
    ) external view returns (address) {
        return IERC4626(sdUSDToken).asset();
    }

    /**
     * @notice Convert sdUSD shares to underlying asset amount
     * @param sdUSDToken The sdUSD token address
     * @param shares The amount of shares to convert
     * @return The equivalent amount of underlying assets
     */
    function convertSharesToAssets(
        address sdUSDToken,
        uint256 shares
    ) external view returns (uint256) {
        return IERC4626(sdUSDToken).convertToAssets(shares);
    }

    /**
     * @notice Convert underlying asset amount to sdUSD shares
     * @param sdUSDToken The sdUSD token address
     * @param assets The amount of assets to convert
     * @return The equivalent amount of shares
     */
    function convertAssetsToShares(
        address sdUSDToken,
        uint256 assets
    ) external view returns (uint256) {
        return IERC4626(sdUSDToken).convertToShares(assets);
    }
}
