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

import "../IOracleWrapper.sol";
import "@openzeppelin/contracts-5/access/AccessControl.sol";

abstract contract IAPI3Wrapper is IOracleWrapper, AccessControl {
    /* Core state */

    uint256 public constant API3_BASE_CURRENCY_UNIT = 10 ** 18;
    uint256 public constant API3_HEARTBEAT = 24 hours;
    address public constant BASE_CURRENCY = address(0);
    uint256 public immutable BASE_CURRENCY_UNIT;
    uint256 public heartbeatStaleTimeLimit = 30 minutes;

    /* Roles */

    bytes32 public constant ORACLE_MANAGER_ROLE =
        keccak256("ORACLE_MANAGER_ROLE");

    /* Errors */

    error PriceIsStale();

    constructor(uint256 _baseCurrencyUnit) {
        BASE_CURRENCY_UNIT = _baseCurrencyUnit;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_MANAGER_ROLE, msg.sender);
    }

    function getPriceInfo(
        address asset
    ) public view virtual override returns (uint256 price, bool isAlive);

    function getAssetPrice(
        address asset
    ) external view virtual override returns (uint256) {
        (uint256 price, bool isAlive) = getPriceInfo(asset);
        if (!isAlive) {
            revert PriceIsStale();
        }
        return price;
    }

    function _convertToBaseCurrencyUnit(
        uint256 price
    ) internal view returns (uint256) {
        return (price * BASE_CURRENCY_UNIT) / API3_BASE_CURRENCY_UNIT;
    }

    function setHeartbeatStaleTimeLimit(
        uint256 _newHeartbeatStaleTimeLimit
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        heartbeatStaleTimeLimit = _newHeartbeatStaleTimeLimit;
    }
}
