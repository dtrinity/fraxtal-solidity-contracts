// SPDX-License-Identifier: GPL-2.0-or-later
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

import "./MockOracleAggregator.sol";

contract MockOracleAggregatorWithFailures is MockOracleAggregator {
    mapping(address => bool) private _shouldFailGetAssetPrice;
    mapping(address => bool) private _shouldFailGetPriceInfo;

    constructor(
        address baseCurrency, 
        uint256 baseCurrencyUnit
    ) MockOracleAggregator(baseCurrency, baseCurrencyUnit) {}

    function setShouldFailGetAssetPrice(address asset, bool shouldFail) external {
        _shouldFailGetAssetPrice[asset] = shouldFail;
    }

    function setShouldFailGetPriceInfo(address asset, bool shouldFail) external {
        _shouldFailGetPriceInfo[asset] = shouldFail;
    }

    function getAssetPrice(
        address _asset
    ) external view override returns (uint256) {
        if (_shouldFailGetAssetPrice[_asset]) {
            revert("Mock oracle aggregator failure");
        }
        
        if (_asset == BASE_CURRENCY) {
            return BASE_CURRENCY_UNIT;
        }

        uint256 _price = prices[_asset];
        require(isAlive[_asset], "Price feed is not alive");

        return _price;
    }

    function getPriceInfo(
        address _asset
    ) external view override returns (uint256 price, bool _isAlive) {
        if (_shouldFailGetPriceInfo[_asset]) {
            revert("Mock oracle aggregator failure");
        }
        
        if (_asset == BASE_CURRENCY) {
            return (BASE_CURRENCY_UNIT, true);
        }

        price = prices[_asset];
        _isAlive = isAlive[_asset];

        return (price, _isAlive);
    }
}