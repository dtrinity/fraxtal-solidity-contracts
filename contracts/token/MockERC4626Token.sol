// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20, IERC20Metadata, ERC20} from "@openzeppelin/contracts-5/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts-5/token/ERC20/utils/SafeERC20.sol";
import {IERC4626} from "@openzeppelin/contracts-5/interfaces/IERC4626.sol";
import {Math} from "@openzeppelin/contracts-5/utils/math/Math.sol";
import {ERC4626} from "@openzeppelin/contracts-5/token/ERC20/extensions/ERC4626.sol";

/**
 * @title MockERC4626Token
 * @dev A simple implementation of ERC4626 vault token for testing purposes
 */
contract MockERC4626Token is ERC4626 {
    using Math for uint256;
    using SafeERC20 for IERC20;

    /**
     * @dev Constructor for MockERC4626Token
     * @param asset_ The underlying asset token
     * @param name_ Name of the vault token
     * @param symbol_ Symbol of the vault token
     */
    constructor(
        address asset_,
        string memory name_,
        string memory symbol_
    ) ERC4626(IERC20(asset_)) ERC20(name_, symbol_) {}

    /**
     * @dev Hook that is called before any deposit/mint.
     * Override this to add custom logic for deposits.
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        super._deposit(caller, receiver, assets, shares);
    }

    /**
     * @dev Hook that is called before any withdrawal/redemption.
     * Override this to add custom logic for withdrawals.
     */
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal virtual override {
        super._withdraw(caller, receiver, owner, assets, shares);
    }
}
