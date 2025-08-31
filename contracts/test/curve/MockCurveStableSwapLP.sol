// SPDX-License-Identifier: MIT
/* ———————————————————————————————————————————————————————————————————————————————— *
 *    _____     ______   ______     __     __   __     __     ______   __  __       *
 *   /\  __-.  /\__  _\ /\  == \   /\ \   /\ "-.\ \   /\ \   /\__  _\ /\ \_\ \      *
 *   \ \ \/\ \ \/_/\ \/ \ \  __<   \ \ \  \ \ \-.  \  \ \ \  \/_/\ \/ \ \____ \     *
 *    \ \____-    \ \_\  \ \_\ \_\  \ \_\  \ \_\\"\_\  \ \_\    \ \_\  \/\_____\    *
 *     \/____/     \/_/   \/_/ /_/   \/_/   \/_/ \/_/   \/_/     \/_/   \/_____/    *
 *                                                                                  *
 * ————————————————————————————————— dtrinity.org ————————————————————————————————— *
 *                                                                                  *
 *                                         ▲                                        *
 *                                        ▲ ▲                                       *
 *                                                                                  *
 * ———————————————————————————————————————————————————————————————————————————————— *
 * dTRINITY Protocol: https://github.com/dtrinity                                   *
 * ———————————————————————————————————————————————————————————————————————————————— */

pragma solidity 0.8.20;

import "@openzeppelin/contracts-5/token/ERC20/ERC20.sol";

/**
 * @title MockCurveStableSwapLP
 * @notice Mock Curve StableSwap pool for testing LP oracle
 */
contract MockCurveStableSwapLP is ERC20 {
    uint256 private _virtualPrice;
    uint256 public N_COINS;
    address[] private _coins;
    address public token; // LP token address
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 nCoins
    ) ERC20(name, symbol) {
        _virtualPrice = 1e18; // Start at 1.0
        N_COINS = nCoins;
        _coins = new address[](nCoins);
        token = address(this); // Pool is the LP token
    }

    function setVirtualPrice(uint256 price) external {
        _virtualPrice = price;
    }

    function get_virtual_price() external view returns (uint256) {
        return _virtualPrice;
    }

    function setCoin(uint256 index, address coin) external {
        require(index < N_COINS, "Invalid index");
        _coins[index] = coin;
    }

    function coins(uint256 index) external view returns (address) {
        require(index < N_COINS, "Invalid index");
        return _coins[index];
    }

    function setToken(address _token) external {
        token = _token;
    }
}