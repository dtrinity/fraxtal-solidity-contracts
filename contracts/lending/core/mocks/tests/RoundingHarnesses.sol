// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.10;

import { IPool } from "../../interfaces/IPool.sol";
import { IPoolAddressesProvider } from "../../interfaces/IPoolAddressesProvider.sol";
import { IERC20 } from "../../dependencies/openzeppelin/contracts/IERC20.sol";
import { SafeCast } from "../../dependencies/openzeppelin/contracts/SafeCast.sol";
import { Errors } from "../../protocol/libraries/helpers/Errors.sol";
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
    using SafeCast for uint256;

    constructor(IPool pool) AToken(pool) {}

    function harnessMint(address caller, address onBehalfOf, uint256 amount, uint256 index) external returns (bool) {
        return _mintScaled(caller, onBehalfOf, amount, index, WadRayMath.Rounding.Floor);
    }

    function harnessBurn(address from, address target, uint256 amount, uint256 index) external {
        _burnScaled(from, target, amount, index, WadRayMath.Rounding.Ceil);
    }

    function harnessWithdraw(address from, address target, uint256 amount, uint256 index) external {
        _burnScaled(from, target, amount, index, WadRayMath.Rounding.Ceil);
        IERC20(_underlyingAsset).transfer(target, amount);
    }
}

contract LegacyATokenHarness is AToken {
    using SafeCast for uint256;
    using WadRayMath for uint256;

    constructor(IPool pool) AToken(pool) {}

    function legacyMint(address caller, address onBehalfOf, uint256 amount, uint256 index) external returns (bool) {
        uint256 amountScaled = amount.rayDiv(index);
        require(amountScaled != 0, Errors.INVALID_MINT_AMOUNT);

        uint256 scaledBalance = _userState[onBehalfOf].balance;
        uint256 balanceIncrease = scaledBalance.rayMul(index) - scaledBalance.rayMul(_userState[onBehalfOf].additionalData);

        _userState[onBehalfOf].additionalData = index.toUint128();
        _totalSupply += amountScaled;
        _userState[onBehalfOf].balance += amountScaled.toUint128();

        emit Transfer(address(0), onBehalfOf, amount + balanceIncrease);
        emit Mint(caller, onBehalfOf, amount + balanceIncrease, balanceIncrease, index);

        return scaledBalance == 0;
    }

    function legacyBalanceOf(address user) external view returns (uint256) {
        return uint256(_userState[user].balance).rayMul(POOL.getReserveNormalizedIncome(_underlyingAsset));
    }

    function legacyWithdraw(address from, address target, uint256 amount, uint256 index) external {
        uint256 amountScaled = amount.rayDiv(index);
        require(amountScaled != 0, Errors.INVALID_BURN_AMOUNT);

        uint256 scaledBalance = _userState[from].balance;
        uint256 balanceIncrease = scaledBalance.rayMul(index) - scaledBalance.rayMul(_userState[from].additionalData);

        _userState[from].additionalData = index.toUint128();
        _totalSupply -= amountScaled;
        _userState[from].balance -= amountScaled.toUint128();

        if (balanceIncrease > amount) {
            uint256 amountToMint = balanceIncrease - amount;
            emit Transfer(address(0), from, amountToMint);
            emit Mint(from, from, amountToMint, balanceIncrease, index);
        } else {
            uint256 amountToBurn = amount - balanceIncrease;
            emit Transfer(from, address(0), amountToBurn);
            emit Burn(from, target, amountToBurn, balanceIncrease, index);
        }

        IERC20(_underlyingAsset).transfer(target, amount);
    }
}

contract VariableDebtTokenHarness is VariableDebtToken {
    using SafeCast for uint256;

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
