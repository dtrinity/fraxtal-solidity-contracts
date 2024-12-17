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

pragma solidity ^0.8.0;
pragma abicoder v2;

import {IPriceOracleGetter} from "../../lending/core/interfaces/IPriceOracleGetter.sol";

contract MockStaticOracleWrapper is IPriceOracleGetter {
    address public immutable BASE_CURRENCY;
    uint256 public immutable BASE_CURRENCY_UNIT;

    mapping(address => uint256) public prices;

    constructor(address _baseCurrency, uint256 _baseCurrencyUnit) {
        BASE_CURRENCY = _baseCurrency;
        BASE_CURRENCY_UNIT = _baseCurrencyUnit;
    }

    function setAssetPrice(address _asset, uint256 _price) external {
        if (_asset == BASE_CURRENCY) {
            revert("Cannot set price for quote token");
        }

        prices[_asset] = _price;
    }

    /// @inheritdoc IPriceOracleGetter
    function getAssetPrice(address _asset) external view returns (uint256) {
        if (_asset == BASE_CURRENCY) {
            return BASE_CURRENCY_UNIT;
        }

        // If price is not set, revert
        uint256 _price = prices[_asset];
        require(_price > 0, "No price available");

        return _price;
    }
}
