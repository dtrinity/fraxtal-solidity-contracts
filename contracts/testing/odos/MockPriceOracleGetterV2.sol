// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockPriceOracleGetterV2
 * @notice Mock price oracle for testing
 */
contract MockPriceOracleGetterV2 {
    mapping(address => uint256) private prices;

    function setAssetPrice(address asset, uint256 price) external {
        prices[asset] = price;
    }

    function getAssetPrice(address asset) external view returns (uint256) {
        uint256 price = prices[asset];
        return price == 0 ? 1e8 : price; // Default to $1 if not set
    }
}
