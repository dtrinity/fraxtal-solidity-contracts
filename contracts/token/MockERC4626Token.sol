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

    // Storage for testing overrides
    mapping(address => uint256) private _testBalances;
    uint256 private _testTotalSupply;
    uint256 private _testTotalAssets;
    bool private _useTestValues;

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

    // ========== TESTING METHODS ==========

    /**
     * @dev Set the balance of an account for testing purposes
     * @param account The account to set the balance for
     * @param balance The balance to set
     */
    function setBalance(address account, uint256 balance) external {
        _testBalances[account] = balance;
        _useTestValues = true;
    }

    /**
     * @dev Set the total supply for testing purposes
     * @param totalSupply_ The total supply to set
     */
    function setTotalSupply(uint256 totalSupply_) external {
        _testTotalSupply = totalSupply_;
        _useTestValues = true;
    }

    /**
     * @dev Set the total assets for testing purposes
     * @param totalAssets_ The total assets to set
     */
    function setTotalAssets(uint256 totalAssets_) external {
        _testTotalAssets = totalAssets_;
        _useTestValues = true;
    }

    /**
     * @dev Reset to use normal ERC4626 behavior instead of test values
     */
    function resetTestValues() external {
        _useTestValues = false;
    }

    // ========== OVERRIDES FOR TESTING ==========

    /**
     * @dev Override balanceOf to use test values when set
     */
    function balanceOf(
        address account
    ) public view virtual override(ERC20, IERC20) returns (uint256) {
        if (_useTestValues) {
            return _testBalances[account];
        }
        return super.balanceOf(account);
    }

    /**
     * @dev Override totalSupply to use test values when set
     */
    function totalSupply()
        public
        view
        virtual
        override(ERC20, IERC20)
        returns (uint256)
    {
        if (_useTestValues) {
            return _testTotalSupply;
        }
        return super.totalSupply();
    }

    /**
     * @dev Override totalAssets to use test values when set
     */
    function totalAssets() public view virtual override returns (uint256) {
        if (_useTestValues) {
            return _testTotalAssets;
        }
        return super.totalAssets();
    }

    /**
     * @dev Override convertToAssets to use test values when set
     */
    function convertToAssets(
        uint256 shares
    ) public view virtual override returns (uint256) {
        if (_useTestValues) {
            // Manual calculation using test values: assets = shares * totalAssets / totalSupply
            uint256 supply = _testTotalSupply;
            if (supply == 0) {
                return 0;
            }
            // Use Math.mulDiv for better precision if available, otherwise standard division
            return (shares * _testTotalAssets) / supply;
        }
        return super.convertToAssets(shares);
    }

    /**
     * @dev Override convertToShares to use test values when set
     */
    function convertToShares(
        uint256 assets
    ) public view virtual override returns (uint256) {
        if (_useTestValues) {
            // Manual calculation using test values: shares = assets * totalSupply / totalAssets
            uint256 totalAssets_ = _testTotalAssets;
            return
                totalAssets_ == 0
                    ? 0
                    : (assets * _testTotalSupply) / totalAssets_;
        }
        return super.convertToShares(assets);
    }
}
