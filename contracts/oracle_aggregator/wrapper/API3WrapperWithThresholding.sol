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

import "./API3Wrapper.sol";
import "@openzeppelin/contracts-5/access/Ownable.sol";

contract API3WrapperWithThresholding is API3Wrapper {
    uint256 public lowerThresholdInBase;
    uint256 public fixedPriceInBase;

    constructor(
        uint256 _baseCurrencyUnit,
        uint256 _initialLowerThreshold,
        uint256 _initialFixedPrice
    ) API3Wrapper(_baseCurrencyUnit) {
        lowerThresholdInBase = _initialLowerThreshold;
        fixedPriceInBase = _initialFixedPrice;
    }

    function getPriceInfo(
        address asset
    ) public view override returns (uint256 price, bool isAlive) {
        (price, isAlive) = super.getPriceInfo(asset);

        if (price > lowerThresholdInBase) {
            price = fixedPriceInBase;
        }
    }

    function setLowerThreshold(
        uint256 _newLowerThreshold
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        lowerThresholdInBase = _newLowerThreshold;
    }

    function setFixedPrice(
        uint256 _newFixedPrice
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        fixedPriceInBase = _newFixedPrice;
    }
}
