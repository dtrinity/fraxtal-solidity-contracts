// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;
pragma abicoder v2;

import {IPriceOracleGetter} from "../../lending/core/interfaces/IPriceOracleGetter.sol";

contract MockStaticOracleWrapper is IPriceOracleGetter {
    address public immutable QUOTE_TOKEN;
    uint256 public immutable PRICE_UNIT;

    mapping(address => uint256) public prices;

    constructor(address _quoteToken, uint8 _priceDecimals) {
        QUOTE_TOKEN = _quoteToken;
        uint8 priceDecimals = _priceDecimals;
        PRICE_UNIT = 10 ** priceDecimals;
    }

    function setAssetPrice(address _asset, uint256 _price) external {
        if (_asset == QUOTE_TOKEN) {
            revert("Cannot set price for quote token");
        }

        prices[_asset] = _price;
    }

    /// @inheritdoc IPriceOracleGetter
    function getAssetPrice(address _baseToken) external view returns (uint256) {
        if (_baseToken == QUOTE_TOKEN) {
            return PRICE_UNIT;
        }

        // If price is not set, revert
        uint256 _price = prices[_baseToken];
        require(_price > 0, "No price available");

        return _price;
    }

    /// @inheritdoc IPriceOracleGetter
    function BASE_CURRENCY() external view returns (address) {
        // Just to follow the interface, we return the quote token here
        return QUOTE_TOKEN;
    }

    /// @inheritdoc IPriceOracleGetter
    function BASE_CURRENCY_UNIT() external view returns (uint256) {
        // The BASE_CURRENCY_UNIT is not the same as QUOTE_TOKEN_UNIT, instead, it is the
        // price unit of the quote token. We return PRICE_UNIT here to avoid breaking
        // assumptions in the AaveOracle contract.
        return PRICE_UNIT;
    }
}
