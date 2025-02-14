// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import {IERC20} from "../lending/core/dependencies/openzeppelin/contracts/IERC20.sol";
import {IERC20Detailed} from "../lending/core/dependencies/openzeppelin/contracts/IERC20Detailed.sol";

// Mock VariableDebtToken with minimal implementation needed for tests
contract MockVariableDebtToken is IERC20, IERC20Detailed {
    uint256 private total;
    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint8 private _decimals;
    string private _name;
    string private _symbol;

    constructor() {
        _decimals = 18; // Default to 18 decimals
        _name = "Mock Variable Debt Token";
        _symbol = "mVDT";
    }

    function setDecimals(uint8 decimals_) external {
        _decimals = decimals_;
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

    function setTotalSupply(uint256 amount) external {
        total = amount;
    }

    function scaledTotalSupply() external view returns (uint256) {
        return total;
    }

    function totalSupply() external view override returns (uint256) {
        // For mock purposes, scaled and regular total supply are the same
        return total;
    }

    function balanceOf(
        address account
    ) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(
        address to,
        uint256 amount
    ) external override returns (bool) {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(
        address owner,
        address spender
    ) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(
        address spender,
        uint256 amount
    ) external override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external override returns (bool) {
        require(
            _allowances[from][msg.sender] >= amount,
            "Insufficient allowance"
        );
        require(_balances[from] >= amount, "Insufficient balance");
        _allowances[from][msg.sender] -= amount;
        _balances[from] -= amount;
        _balances[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
