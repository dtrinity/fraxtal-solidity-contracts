// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import { DataTypes } from "../lending/core/protocol/libraries/types/DataTypes.sol";

contract MockPool {
    mapping(address => DataTypes.ReserveData) private reserves;

    function setReserveData(address asset, address aToken, address debtToken) external {
        _setReserveData(asset, aToken, address(0), debtToken);
    }

    function setReserveData(address asset, address aToken, address stableDebtToken, address variableDebtToken) external {
        _setReserveData(asset, aToken, stableDebtToken, variableDebtToken);
    }

    function _setReserveData(address asset, address aToken, address stableDebtToken, address variableDebtToken) internal {
        DataTypes.ReserveData memory newReserve = DataTypes.ReserveData({
            configuration: DataTypes.ReserveConfigurationMap(0),
            liquidityIndex: 1e27, // Initial liquidity index
            currentLiquidityRate: 0,
            variableBorrowIndex: 1e27, // Initial borrow index
            currentVariableBorrowRate: 0,
            currentStableBorrowRate: 0,
            lastUpdateTimestamp: uint40(block.timestamp),
            id: 0,
            aTokenAddress: aToken,
            stableDebtTokenAddress: stableDebtToken,
            variableDebtTokenAddress: variableDebtToken,
            interestRateStrategyAddress: address(0),
            accruedToTreasury: 0,
            unbacked: 0,
            isolationModeTotalDebt: 0
        });
        reserves[asset] = newReserve;
    }

    function getReserveData(address asset) external view returns (DataTypes.ReserveData memory) {
        return reserves[asset];
    }
}
