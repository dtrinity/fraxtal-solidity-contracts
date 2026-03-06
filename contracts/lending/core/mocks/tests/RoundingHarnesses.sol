// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.10;

import { IPool } from "../../interfaces/IPool.sol";
import { IPoolAddressesProvider } from "../../interfaces/IPoolAddressesProvider.sol";
import { AToken } from "../../protocol/tokenization/AToken.sol";
import { VariableDebtToken } from "../../protocol/tokenization/VariableDebtToken.sol";
import { WadRayMath } from "../../protocol/libraries/math/WadRayMath.sol";

contract RoundingPoolAddressesProviderMock {
    function getACLManager() external pure returns (address) {
        return address(0);
    }
}

contract RoundingPoolMock {
    mapping(address => uint256) internal _normalizedIncome;
    mapping(address => uint256) internal _normalizedVariableDebt;
    IPoolAddressesProvider internal immutable _addressesProvider;

    constructor(IPoolAddressesProvider addressesProvider) {
        _addressesProvider = addressesProvider;
    }

    function ADDRESSES_PROVIDER() external view returns (IPoolAddressesProvider) {
        return _addressesProvider;
    }

    function setReserveNormalizedIncome(address asset, uint256 index) external {
        _normalizedIncome[asset] = index;
    }

    function setReserveNormalizedVariableDebt(address asset, uint256 index) external {
        _normalizedVariableDebt[asset] = index;
    }

    function getReserveNormalizedIncome(address asset) external view returns (uint256) {
        return _normalizedIncome[asset];
    }

    function getReserveNormalizedVariableDebt(address asset) external view returns (uint256) {
        return _normalizedVariableDebt[asset];
    }

    function finalizeTransfer(address, address, address, uint256, uint256, uint256) external pure {}
}

contract ATokenHarness is AToken {
    constructor(IPool pool) AToken(pool) {}

    function harnessMint(address caller, address onBehalfOf, uint256 amount, uint256 index) external returns (bool) {
        return _mintScaled(caller, onBehalfOf, amount, index, WadRayMath.Rounding.Floor);
    }

    function harnessBurn(address from, address target, uint256 amount, uint256 index) external {
        _burnScaled(from, target, amount, index, WadRayMath.Rounding.Ceil);
    }
}

contract VariableDebtTokenHarness is VariableDebtToken {
    constructor(IPool pool) VariableDebtToken(pool) {}

    function harnessMint(
        address user,
        address onBehalfOf,
        uint256 amount,
        uint256 index
    ) external returns (bool, uint256) {
        return (_mintScaled(user, onBehalfOf, amount, index, WadRayMath.Rounding.Ceil), scaledTotalSupply());
    }

    function harnessBurn(address from, uint256 amount, uint256 index) external returns (uint256) {
        _burnScaled(from, address(0), amount, index, WadRayMath.Rounding.Floor);
        return scaledTotalSupply();
    }
}
