// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-5/token/ERC20/ERC20.sol";
import "../../vaults/atoken_wrapper/interfaces/IERC4626.sol";

/**
 * @title MockERC4626
 * @notice Mock ERC4626 vault for testing purposes
 */
contract MockERC4626 is ERC20, IERC4626 {
    IERC20 private _asset;
    uint256 private _totalAssets;

    constructor(
        string memory name,
        string memory symbol,
        address asset_
    ) ERC20(name, symbol) {
        _asset = IERC20(asset_);
    }

    function asset() external view override returns (address) {
        return address(_asset);
    }

    function totalAssets() external view override returns (uint256) {
        return _totalAssets;
    }

    function convertToShares(uint256 assets) external view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return assets;
        return (assets * supply) / _totalAssets;
    }

    function convertToAssets(uint256 shares) external view override returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return shares;
        return (shares * _totalAssets) / supply;
    }

    function maxDeposit(address) external pure override returns (uint256) {
        return type(uint256).max;
    }

    function previewDeposit(uint256 assets) external view override returns (uint256) {
        return this.convertToShares(assets);
    }

    function deposit(uint256 assets, address receiver) external override returns (uint256) {
        uint256 shares = this.convertToShares(assets);
        _asset.transferFrom(msg.sender, address(this), assets);
        _totalAssets += assets;
        _mint(receiver, shares);
        return shares;
    }

    function maxMint(address) external pure override returns (uint256) {
        return type(uint256).max;
    }

    function previewMint(uint256 shares) external view override returns (uint256) {
        return this.convertToAssets(shares);
    }

    function mint(uint256 shares, address receiver) external override returns (uint256) {
        uint256 assets = this.convertToAssets(shares);
        _asset.transferFrom(msg.sender, address(this), assets);
        _totalAssets += assets;
        _mint(receiver, shares);
        return assets;
    }

    function maxWithdraw(address owner) external view override returns (uint256) {
        return this.convertToAssets(balanceOf(owner));
    }

    function previewWithdraw(uint256 assets) external view override returns (uint256) {
        return this.convertToShares(assets);
    }

    function withdraw(uint256 assets, address receiver, address owner) external override returns (uint256) {
        uint256 shares = this.convertToShares(assets);
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }
        _burn(owner, shares);
        _totalAssets -= assets;
        _asset.transfer(receiver, assets);
        return shares;
    }

    function maxRedeem(address owner) external view override returns (uint256) {
        return balanceOf(owner);
    }

    function previewRedeem(uint256 shares) external view override returns (uint256) {
        return this.convertToAssets(shares);
    }

    function redeem(uint256 shares, address receiver, address owner) external override returns (uint256) {
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }
        uint256 assets = this.convertToAssets(shares);
        _burn(owner, shares);
        _totalAssets -= assets;
        _asset.transfer(receiver, assets);
        return assets;
    }

    // Helper functions for testing
    function setTotalAssets(uint256 amount) external {
        _totalAssets = amount;
    }

    function mintShares(address to, uint256 amount) external {
        _mint(to, amount);
    }
}