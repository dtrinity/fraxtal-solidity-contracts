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

import "../interface/curve/ICurveLPOracleWrapper.sol";
import "../interface/curve/ICurveStableNG.sol";
import "../interface/IOracleWrapper.sol";

/**
 * @title CurveLPOracleWrapper
 * @notice Oracle wrapper for Curve StableSwap LP tokens
 * @dev Uses virtual price to calculate LP token value using the formula:
 *      LP_price = virtual_price * base_asset_price / CURVE_BASE_CURRENCY_UNIT
 *      Where virtual_price is from Curve pool's get_virtual_price() function
 *      Note: Only supports StableSwap pools, will revert for CryptoSwap pools
 */
contract CurveLPOracleWrapper is ICurveLPOracleWrapper {
    /* Constants */
    
    /// @notice Invalid index marker for base asset search
    uint256 private constant INVALID_INDEX = type(uint256).max;
    
    /* Core state */

    /// @notice Oracle aggregator for base asset pricing
    IOracleWrapper public immutable oracleAggregator;

    /// @notice Mapping from LP token to configuration
    mapping(address => LPConfig) public lpConfigs;

    constructor(
        uint256 _baseCurrencyUnit,
        address _oracleAggregator
    ) ICurveLPOracleWrapper(_baseCurrencyUnit) {
        if (_oracleAggregator == address(0)) revert InvalidAddress();
        oracleAggregator = IOracleWrapper(_oracleAggregator);
    }

    function setLPConfig(
        address lpToken,
        address pool,
        address baseAsset
    ) external override onlyRole(ORACLE_MANAGER_ROLE) {
        if (lpToken == address(0) || pool == address(0) || baseAsset == address(0)) {
            revert InvalidAddress();
        }

        // Verify it's a StableSwap pool by checking for get_virtual_price
        try ICurveStableNG(pool).get_virtual_price() returns (uint256) {
            // Success - it's a StableSwap pool
        } catch {
            revert NotStableSwapPool(pool);
        }

        // In Curve StableSwap, the pool contract is typically the LP token
        // We'll accept if lpToken equals pool address
        if (lpToken != pool) {
            revert LPTokenMismatch(lpToken, pool);
        }

        // Cache the pool interface
        ICurveStableNG poolContract = ICurveStableNG(pool);
        
        // Find base asset index in the pool
        uint256 baseAssetIndex = INVALID_INDEX;
        uint256 nCoins;
        
        try poolContract.N_COINS() returns (uint256 n) {
            nCoins = n;
        } catch {
            revert InvalidPool(pool);
        }

        // Optimized loop with unchecked arithmetic
        for (uint256 i; i < nCoins;) {
            if (poolContract.coins(i) == baseAsset) {
                baseAssetIndex = i;
                break;
            }
            unchecked { ++i; }
        }

        if (baseAssetIndex == INVALID_INDEX) {
            revert BaseAssetNotInPool(baseAsset, pool);
        }
        
        // Ensure the index fits in uint8 (extremely unlikely to exceed 255 coins)
        require(baseAssetIndex <= type(uint8).max, "Too many coins in pool");

        lpConfigs[lpToken] = LPConfig({
            pool: pool,
            baseAsset: baseAsset,
            baseAssetIndex: uint8(baseAssetIndex)
        });

        emit LPConfigSet(lpToken, pool, baseAsset, uint8(baseAssetIndex));
    }

    function removeLPConfig(
        address lpToken
    ) external override onlyRole(ORACLE_MANAGER_ROLE) {
        delete lpConfigs[lpToken];
        emit LPConfigRemoved(lpToken);
    }

    function getPriceInfo(
        address lpToken
    ) public view override returns (uint256 price, bool isAlive) {
        LPConfig storage config = lpConfigs[lpToken];
        if (config.pool == address(0)) {
            revert LPTokenNotConfigured(lpToken);
        }

        // Get virtual price from Curve pool
        uint256 virtualPrice = ICurveStableNG(config.pool).get_virtual_price();
        
        // Get base asset price from oracle aggregator
        (uint256 baseAssetPrice, bool baseAssetAlive) = oracleAggregator.getPriceInfo(config.baseAsset);
        
        if (!baseAssetAlive) {
            return (0, false);
        }

        // LP price = virtual_price * base_asset_price / 1e18
        // Virtual price is in 1e18, we need to normalize
        price = (virtualPrice * baseAssetPrice) / CURVE_BASE_CURRENCY_UNIT;
        
        isAlive = price > 0;
        return (price, isAlive);
    }

    function getAssetPrice(
        address lpToken
    ) external view override returns (uint256) {
        (uint256 price, bool isAlive) = getPriceInfo(lpToken);
        if (!isAlive) revert PriceIsZero(lpToken);
        return price;
    }
}