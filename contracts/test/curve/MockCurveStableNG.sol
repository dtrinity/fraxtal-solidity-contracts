// SPDX-License-Identifier: MIT
/* ———————————————————————————————————————————————————————————————————————————————— *
 *    _____     ______   ______     __     __   __     __     ______   __  __       *
 *   /\  __-.  /\__  _\ /\  == \   /\ \   /\ "-.\ \   /\ \   /\__  _\ /\ \_\ \      *
 *   \ \ \/\ \ \/_/\ \/ \ \  __<   \ \ \  \ \ \-.  \  \ \ \  \/_/\ \/ \ \____ \     *
 *    \ \____-    \ \_\  \ \_\ \_\  \ \_\  \ \_\"\_\  \ \_\    \ \_\  \/\_____\    *
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

contract MockCurveStableNG {
    uint256 public nCoins;
    address[] private _coins;

    uint256 private _virtualPrice;
    uint256 private _dOracle;
    uint256[] private _storedRates;
    uint256[] private _balances;

    constructor(
        string memory /*name*/,
        string memory /*symbol*/,
        uint256 _nCoins
    ) {
        nCoins = _nCoins;
        _coins = new address[](_nCoins);
        _virtualPrice = 1e18;
        _dOracle = 0;
        _storedRates = new uint256[](_nCoins);
        _balances = new uint256[](_nCoins);
        for (uint256 i; i < _nCoins; ) {
            _storedRates[i] = 1e18;
            _balances[i] = 0;
            unchecked {
                ++i;
            }
        }
    }

    function setVirtualPrice(uint256 vp) external {
        _virtualPrice = vp;
    }
    function setDOracle(uint256 d) external {
        _dOracle = d;
    }
    function setStoredRates(uint256[] calldata rates) external {
        require(rates.length == nCoins, "bad len");
        _storedRates = rates;
    }
    function setBalances(uint256[] calldata bals) external {
        require(bals.length == nCoins, "bad len");
        _balances = bals;
    }
    function setCoin(uint256 i, address coin) external {
        require(i < nCoins, "i");
        _coins[i] = coin;
    }

    // NG-like views used in wrappers
    function get_virtual_price() external view returns (uint256) {
        return _virtualPrice;
    }
    function D_oracle() external view returns (uint256) {
        return _dOracle;
    }
    function stored_rates() external view returns (uint256[] memory) {
        return _storedRates;
    }
    function get_balances() external view returns (uint256[] memory) {
        return _balances;
    }
    function coins(uint256 i) external view returns (address) {
        return _coins[i];
    }
    function N_COINS() external view returns (uint256) {
        return nCoins;
    }
}

