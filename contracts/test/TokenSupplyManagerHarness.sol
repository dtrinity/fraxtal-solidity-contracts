// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../token/TokenSupplyManager.sol";

contract TokenSupplyManagerHarness is TokenSupplyManager {
    constructor(
        IERC20Stablecoin collateral,
        IERC20Stablecoin receipt
    ) TokenSupplyManager(collateral, receipt) {}

    function testConvertAmountBetweenDecimals(
        uint256 amount,
        uint8 fromDecimals,
        uint8 toDecimals
    ) public pure returns (uint256) {
        return _convertAmountBetweenDecimals(amount, fromDecimals, toDecimals);
    }
}
