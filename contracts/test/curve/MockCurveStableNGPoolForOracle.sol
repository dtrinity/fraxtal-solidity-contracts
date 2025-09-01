// SPDX-License-Identifier: MIT
/* ———————————————————————————————————————————————————————————————————————————————— *
 *    _____     ______   ______     __     __   __     __     ______   __  __       *
 *   /\  __-.  /\__  _\ /\  == \   /\ \   /\ "-.\ \   /\ \   /\__  _\ /\ \_\ \      *
 *   \ \ \/\ \ \/_/\ \/ \ \  __<   \ \ \  \ \ \-.  \  \ \ \  \/_/\ \/ \ \____ \     *
 *    \ \____-    \ \_\  \ \_\ \_\  \ \_\  \ \_"\_\  \ \_\    \ \_\  \/\_____\    *
 *     \/____/     \/_/   \/_/ /_/   \/_/   \/_/ \/_/   \/_/     \/_/   \/_____ /    *
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

import "../../oracle_aggregator/wrapper/CurveOracleWrapper.sol";

/**
 * @title MockCurveStableNGPoolForOracle
 * @notice NG pool mock exposing price index and quoting views used by price-oracle wrappers
 * @dev Exposes: get_dy, price_oracle, stored_rates, coins, N_COINS; plus a decimals setter for tests
 */
contract MockCurveStableNGPoolForOracle {
    uint256 public expectedOutput;
    uint256 public constant N_COINS = 2;
    uint256 public decimals = 18;

    uint256[] private _storedRates;
    mapping(uint256 => uint256) private _priceOracles;

    address[2] private _coins;

    constructor() {
        // Initialize stored rates array with default values
        _storedRates = new uint256[](2);
        _storedRates[0] = 1e18; // Default 1.0
        _storedRates[1] = 1e18; // Default 1.0
    }

    function setExpectedOutput(uint256 _expectedOutput) external {
        expectedOutput = _expectedOutput;
    }

    function setCoin(uint256 index, address coin) external {
        require(index < N_COINS, "Invalid index");
        _coins[index] = coin;
    }

    function coins(uint256 index) external view returns (address) {
        require(index < N_COINS, "Invalid index");
        return _coins[index];
    }

    function get_dy(
        int128 /* i */,
        int128 /* j */,
        uint256 /* dx */
    ) external view returns (uint256) {
        return expectedOutput;
    }

    function setDecimals(uint256 _decimals) external {
        decimals = _decimals;
    }

    function price_oracle(uint256 index) external view returns (uint256) {
        return _priceOracles[index];
    }

    function stored_rates() external view returns (uint256[] memory) {
        return _storedRates;
    }

    function setPriceOracle(uint256 index, uint256 price) external {
        _priceOracles[index] = price;
    }

    function setStoredRates(uint256[] calldata rates) external {
        require(rates.length == N_COINS, "Invalid rates length");
        _storedRates = rates;
    }
}
