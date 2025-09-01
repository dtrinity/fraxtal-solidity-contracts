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

import "@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title MockCurveStableNGForLP
 * @notice Minimal NG-like pool mock exposing LP-facing oracle views used by LP wrappers
 * @dev Exposes: get_virtual_price, D_oracle, stored_rates, get_balances, coins, N_COINS
 */
contract MockCurveStableNGForLP {
    uint256 public nCoins;
    address[] private _coins;
    uint8[] private _coinDecimals;

    uint256 private _virtualPrice;
    uint256 private _dOracle;
    uint256[] private _storedRates;
    uint256[] private _balances;
    uint256 private _totalSupply;

    constructor(
        string memory /*name*/,
        string memory /*symbol*/,
        uint256 _nCoins
    ) {
        nCoins = _nCoins;
        _coins = new address[](_nCoins);
        _coinDecimals = new uint8[](_nCoins);
        _virtualPrice = 1e18;
        _dOracle = 0;
        _storedRates = new uint256[](_nCoins);
        _balances = new uint256[](_nCoins);
        _totalSupply = 1e18; // Default 1 LP token
        for (uint256 i; i < _nCoins; ) {
            _coinDecimals[i] = 18; // default to 18 decimals
            _storedRates[i] = 1e18; // default rate assuming 18 decimals
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
        // Auto-detect decimals from ERC20 metadata and normalize stored rate
        try IERC20Metadata(coin).decimals() returns (uint8 dec) {
            require(dec <= 36, "dec");
            _coinDecimals[i] = dec;
            _storedRates[i] = 10 ** (36 - uint256(dec));
        } catch {
            revert("no metadata");
        }
    }

    function setCoinDecimals(uint256 i, uint8 decimals_) external {
        require(i < nCoins, "i");
        require(decimals_ <= 36, "dec");
        _coinDecimals[i] = decimals_;
        // Normalize stored rate so that 1 whole coin contributes ~1e18 to xp
        // xp[i] = balances[i] * rate[i] / 1e18
        // For 1 whole coin (10^dec), set rate = 10^(36 - dec)
        _storedRates[i] = 10 ** (36 - uint256(decimals_));
    }

    function setCoinWithDecimals(
        uint256 i,
        address coin,
        uint8 decimals_
    ) external {
        require(i < nCoins, "i");
        require(decimals_ <= 36, "dec");
        _coins[i] = coin;
        _coinDecimals[i] = decimals_;
        _storedRates[i] = 10 ** (36 - uint256(decimals_));
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
    
    // ERC20-like interface for LP token (since pool == LP token in NG pools)
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }
    
    function setTotalSupply(uint256 supply) external {
        _totalSupply = supply;
    }
}
