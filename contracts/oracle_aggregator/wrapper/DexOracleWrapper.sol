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

import "contracts/lending/core/interfaces/IPriceOracleGetter.sol";
import "../interface/IOracleWrapper.sol";

contract DexOracleWrapper is IOracleWrapper {
    IPriceOracleGetter public priceOracle;

    constructor(address _priceOracle) {
        priceOracle = IPriceOracleGetter(_priceOracle);
    }

    /**
     * @dev Get the price info of an asset
     */
    function getPriceInfo(
        address asset
    ) external view returns (uint256 price, bool isAlive) {
        price = priceOracle.getAssetPrice(asset);
        isAlive = price > 0;

        return (price, isAlive);
    }

    /**
     * @dev Get the price of an asset
     */
    function getAssetPrice(address asset) external view returns (uint256) {
        return priceOracle.getAssetPrice(asset);
    }

    /**
     * @dev Get the base currency address
     */
    function BASE_CURRENCY() external view returns (address) {
        return priceOracle.BASE_CURRENCY();
    }

    /**
     * @dev Get the base currency unit
     */
    function BASE_CURRENCY_UNIT() external view returns (uint256) {
        return priceOracle.BASE_CURRENCY_UNIT();
    }
}
