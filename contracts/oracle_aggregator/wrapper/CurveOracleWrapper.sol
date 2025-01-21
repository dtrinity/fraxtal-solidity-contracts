// SPDX-License-Identifier: MIT
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

pragma solidity 0.8.20;

import "../interface/curve/ICurveOracleWrapper.sol";
import "../interface/curve/ICurveStableNG.sol";
import "@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title CurveOracleWrapper
 * @notice Oracle wrapper for Curve pools
 * @dev Uses get_dy to calculate the effective exchange rate between two tokens
 */
contract CurveOracleWrapper is ICurveOracleWrapper {
    /* Constants */

    uint256 private constant REQUIRED_N_COINS = 2; // Required number of coins in pool

    /* Core state */

    /// @notice Mapping from asset to pool and token index
    mapping(address => PoolConfig) public assetConfigs;

    struct PoolConfig {
        address pool;
        uint256 tokenIndex;
    }

    constructor(
        uint256 _baseCurrencyUnit
    ) ICurveOracleWrapper(_baseCurrencyUnit) {}

    function setAssetConfig(
        address asset,
        address pool
    ) external override onlyRole(ORACLE_MANAGER_ROLE) {
        if (pool == address(0)) revert InvalidPool(pool);

        ICurveStableNG curvePool = ICurveStableNG(pool);

        try curvePool.N_COINS() returns (uint256 nCoins) {
            if (nCoins != REQUIRED_N_COINS) revert InvalidPool(pool);
        } catch {
            revert InvalidPool(pool);
        }

        uint256 tokenIndex = type(uint256).max; // Invalid initial value

        // Find the token index by iterating through coins
        for (uint256 i = 0; i < REQUIRED_N_COINS; i++) {
            if (curvePool.coins(i) == asset) {
                tokenIndex = i;
                break;
            }
        }

        if (tokenIndex == type(uint256).max)
            revert InvalidTokenIndex(pool, tokenIndex);

        assetConfigs[asset] = PoolConfig({
            pool: address(curvePool),
            tokenIndex: tokenIndex
        });

        emit AssetConfigSet(asset, pool, tokenIndex);
    }

    function removeAssetConfig(
        address asset
    ) external override onlyRole(ORACLE_MANAGER_ROLE) {
        delete assetConfigs[asset];
        emit AssetConfigRemoved(asset);
    }

    function getPriceInfo(
        address asset
    ) public view virtual override returns (uint256 price, bool isAlive) {
        PoolConfig memory config = assetConfigs[asset];
        if (address(config.pool) == address(0))
            revert AssetNotConfigured(asset);

        ICurveStableNG curvePool = ICurveStableNG(config.pool);

        uint256 unscaledPrice;
        uint256 scaledPrice;

        // Since we only support 2 coins now
        // If tokenIndex is 0, get price against token1
        // If tokenIndex is 1, get price against token0
        uint256 otherTokenIndex = config.tokenIndex == 0 ? 1 : 0;
        if (config.tokenIndex > 0) {
            // price_oracle of coins[i] against coins[0]
            unscaledPrice = curvePool.price_oracle(config.tokenIndex - 1);
        } else {
            // get the reverse EMA (price of coins[0] with regard to coins[i]):
            unscaledPrice =
                (CURVE_BASE_CURRENCY_UNIT * CURVE_BASE_CURRENCY_UNIT) /
                curvePool.price_oracle(otherTokenIndex - 1);
        }

        // Get multiplier rate
        uint256[] memory rates = curvePool.stored_rates();
        if (rates.length <= config.tokenIndex) {
            scaledPrice = unscaledPrice;
        } else {
            scaledPrice =
                (rates[config.tokenIndex] * unscaledPrice) /
                CURVE_RATE_PRECISION;
        }

        price = _convertToBaseCurrencyUnit(scaledPrice);

        isAlive = price > 0;
        return (price, isAlive);
    }
}
