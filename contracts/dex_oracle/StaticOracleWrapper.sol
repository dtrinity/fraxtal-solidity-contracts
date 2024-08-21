// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;
pragma abicoder v2;

import {IPriceOracleGetter} from "../lending/core/interfaces/IPriceOracleGetter.sol";

import "./interfaces/IStaticOracle.sol";

/// @title Uniswap V3 Static Oracle Wrapper
/// @notice Oracle contract for price quoting against Uniswap V3 pools
contract StaticOracleWrapper is IPriceOracleGetter {
    IStaticOracle public immutable STATIC_ORACLE;
    address public immutable QUOTE_TOKEN;
    uint8 public immutable QUOTE_TOKEN_DECIMALS;
    uint256 public immutable QUOTE_TOKEN_UNIT;
    uint128 public immutable QUOTE_TOKEN_AMOUNT;
    uint32 public immutable QUOTE_PERIOD_SECONDS;
    uint8 public immutable PRICE_DECIMALS;
    uint256 public immutable PRICE_UNIT;

    constructor(
        IStaticOracle _STATIC_ORACLE,
        address _quoteToken,
        uint128 _quoteTokenAmount,
        uint32 _quotePeriodSeconds,
        uint8 _priceDecimals
    ) {
        STATIC_ORACLE = _STATIC_ORACLE;
        QUOTE_TOKEN = _quoteToken;

        (bool success, bytes memory data) = _quoteToken.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        require(success, "Failed to get quote token decimals");

        QUOTE_TOKEN_DECIMALS = abi.decode(data, (uint8));
        QUOTE_TOKEN_UNIT = 10 ** QUOTE_TOKEN_DECIMALS;
        QUOTE_TOKEN_AMOUNT = _quoteTokenAmount;
        QUOTE_PERIOD_SECONDS = _quotePeriodSeconds;
        PRICE_DECIMALS = _priceDecimals;
        PRICE_UNIT = 10 ** PRICE_DECIMALS;
    }

    /// @inheritdoc IPriceOracleGetter
    function getAssetPrice(address _baseToken) external view returns (uint256) {
        if (_baseToken == QUOTE_TOKEN) {
            return PRICE_UNIT;
        }

        uint256 _baseAmount;
        address[] memory queriedPools;
        (_baseAmount, queriedPools) = STATIC_ORACLE
            .quoteAllAvailablePoolsWithTimePeriod(
                QUOTE_TOKEN_AMOUNT,
                QUOTE_TOKEN,
                _baseToken,
                QUOTE_PERIOD_SECONDS
            );
        require(_baseAmount > 0, "No price available");
        require(queriedPools.length > 0, "No pools queried");

        // Get quote token decimals
        (bool success, bytes memory data) = _baseToken.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        require(success, "Failed to get base token decimals");

        // Calculate price based the following formula:
        //      (quoteAmount / quoteTokenUnit) / (baseTokenAmount / baseTokenUnit)
        //  <=> (quoteAmount * baseTokenUnit) / (baseTokenAmount * quoteTokenUnit)
        // To avoid losing precision, we multiply by 10^PRICE_DECIMALS
        // <=> (quoteAmount * baseTokenUnit * 10^PRICE_DECIMALS) / (baseTokenAmount * quoteTokenUnit)
        uint8 _baseTokenDecimals = abi.decode(data, (uint8));
        uint256 _baseTokenUnit = 10 ** _baseTokenDecimals;

        uint256 _price = (QUOTE_TOKEN_AMOUNT * _baseTokenUnit * PRICE_UNIT) /
            (_baseAmount * QUOTE_TOKEN_UNIT);

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
