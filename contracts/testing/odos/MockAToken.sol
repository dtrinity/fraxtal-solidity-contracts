// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "contracts/lending/core/dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC20Detailed} from "contracts/lending/core/dependencies/openzeppelin/contracts/IERC20Detailed.sol";

/**
 * @title MockAToken
 * @notice Mock AToken for Odos exploit testing
 */
contract MockAToken is IERC20, IERC20Detailed {
    mapping(address => uint256) private balances;
    uint256 private total;
    address private underlying;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint8 private _decimals;
    string private _name;
    string private _symbol;
    address private _pool;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address pool_) {
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
        _pool = pool_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function name() external view override returns (string memory) {
        return _name;
    }

    function symbol() external view override returns (string memory) {
        return _symbol;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return balances[account];
    }

    function totalSupply() external view override returns (uint256) {
        return total;
    }

    function scaledTotalSupply() external view returns (uint256) {
        return total;
    }

    function UNDERLYING_ASSET_ADDRESS() external view returns (address) {
        return underlying;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(_allowances[from][msg.sender] >= amount, "Insufficient allowance");
        require(balances[from] >= amount, "Insufficient balance");
        _allowances[from][msg.sender] -= amount;
        balances[from] -= amount;
        balances[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    // Mint function for pool integration
    function mint(address user, uint256 amount, uint256 index) external returns (bool) {
        balances[user] += amount;
        total += amount;
        emit Transfer(address(0), user, amount);
        return true;
    }

    // Burn function for pool integration
    function burn(address from, address receiverOfUnderlying, uint256 amount, uint256 index) external {
        require(balances[from] >= amount, "Insufficient balance");
        balances[from] -= amount;
        total -= amount;
        emit Transfer(from, address(0), amount);
    }

    // Admin functions for test setup
    function setBalance(address account, uint256 amount) external {
        balances[account] = amount;
    }

    function setUnderlyingAsset(address asset) external {
        underlying = asset;
    }
}
