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

import "./MockCurveStableNGForLP.sol";

/**
 * @title MockCurveStableNGForLPWithFailures
 * @notice Enhanced mock that can simulate various failure scenarios for security testing
 * @dev Extends the base mock with failure simulation capabilities
 */
contract MockCurveStableNGForLPWithFailures is MockCurveStableNGForLP {
    // Failure control flags
    bool private _shouldFailDOracle;
    bool private _shouldFailGetBalances;
    bool private _shouldFailStoredRates;
    bool private _shouldFailTotalSupply;
    bool private _shouldFailVirtualPrice;
    
    // Return invalid data flags
    bool private _returnWrongLengthStoredRates;
    uint256 private _wrongStoredRatesLength;

    constructor(
        string memory name,
        string memory symbol,
        uint256 nCoins
    ) MockCurveStableNGForLP(name, symbol, nCoins) {}

    // Failure control methods
    function setShouldFailDOracle(bool shouldFail) external {
        _shouldFailDOracle = shouldFail;
    }

    function setShouldFailGetBalances(bool shouldFail) external {
        _shouldFailGetBalances = shouldFail;
    }

    function setShouldFailStoredRates(bool shouldFail) external {
        _shouldFailStoredRates = shouldFail;
    }

    function setShouldFailTotalSupply(bool shouldFail) external {
        _shouldFailTotalSupply = shouldFail;
    }

    function setShouldFailVirtualPrice(bool shouldFail) external {
        _shouldFailVirtualPrice = shouldFail;
    }

    function setReturnWrongLengthStoredRates(bool shouldReturn, uint256 wrongLength) external {
        _returnWrongLengthStoredRates = shouldReturn;
        _wrongStoredRatesLength = wrongLength;
    }

    // Override methods to add failure simulation
    function D_oracle() external view override returns (uint256) {
        if (_shouldFailDOracle) {
            revert("Mock D_oracle failure");
        }
        return _dOracle;
    }

    function get_balances() external view override returns (uint256[] memory) {
        if (_shouldFailGetBalances) {
            revert("Mock get_balances failure");
        }
        return _balances;
    }

    function stored_rates() external view override returns (uint256[] memory) {
        if (_shouldFailStoredRates) {
            revert("Mock stored_rates failure");
        }
        
        if (_returnWrongLengthStoredRates) {
            uint256[] memory wrongRates = new uint256[](_wrongStoredRatesLength);
            for (uint256 i = 0; i < _wrongStoredRatesLength; i++) {
                wrongRates[i] = 1e18;
            }
            return wrongRates;
        }
        
        return _storedRates;
    }

    function totalSupply() external view override returns (uint256) {
        if (_shouldFailTotalSupply) {
            revert("Mock totalSupply failure");
        }
        return _totalSupply;
    }

    function get_virtual_price() external view override returns (uint256) {
        if (_shouldFailVirtualPrice) {
            revert("Mock virtual_price failure");
        }
        return _virtualPrice;
    }
}