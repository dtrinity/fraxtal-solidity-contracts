// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IPriceOracleGetter } from "contracts/vaults/dLOOP/core/venue/dlend/interface/IPriceOracleGetter.sol";

contract MockPriceOracleGetter is IPriceOracleGetter {
    mapping(address => uint256) public prices;

    function setPrice(address asset, uint256 price) external {
        prices[asset] = price;
    }

    function BASE_CURRENCY() external pure override returns (address) {
        return address(0);
    }

    function BASE_CURRENCY_UNIT() external pure override returns (uint256) {
        return 1e8;
    }

    function getAssetPrice(address asset) external view override returns (uint256) {
        uint256 price = prices[asset];
        require(price != 0, "price not set");
        return price;
    }
}
