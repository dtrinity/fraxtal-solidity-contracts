// SPDX-License-Identifier: GNU AGPLv3
pragma solidity ^0.8.0;

interface ILiquidator {
    function liquidate(
        address _poolTokenBorrowed,
        address _poolTokenCollateral,
        address _borrower,
        uint256 _amount
    ) external;
}
