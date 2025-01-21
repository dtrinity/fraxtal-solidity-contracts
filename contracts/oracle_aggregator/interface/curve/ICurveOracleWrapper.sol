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

/**
 * @title ICurveOracleWrapper
 * @notice Interface for Curve pool oracle wrappers
 */
abstract contract ICurveOracleWrapper is IOracleWrapper, AccessControl {
    /* Core state */

    /// @notice Base currency unit (e.g. 1e18 for USD)
    uint256 public immutable BASE_CURRENCY_UNIT;

    uint256 public constant CURVE_BASE_CURRENCY_UNIT = 10 ** 18;

    uint256 public constant CURVE_RATE_PRECISION = 10 ** 18;

    /// @notice Base currency (address(0) for USD)
    address public constant BASE_CURRENCY = address(0);

    /* Events */

    event AssetConfigSet(
        address indexed asset,
        address indexed pool,
        uint256 tokenIndex
    );
    event AssetConfigRemoved(address indexed asset);

    /* Errors */

    error AssetNotConfigured(address asset);
    error InvalidPool(address pool);
    error InvalidTokenIndex(address pool, uint256 tokenIndex);
    error PriceIsZero(address asset);

    /* Roles */

    bytes32 public constant ORACLE_MANAGER_ROLE =
        keccak256("ORACLE_MANAGER_ROLE");

    constructor(uint256 _baseCurrencyUnit) {
        BASE_CURRENCY_UNIT = _baseCurrencyUnit;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_MANAGER_ROLE, msg.sender);
    }

    /**
     * @notice Set or update configuration for an asset
     * @param asset Asset address
     * @param pool Curve pool address
     */
    function setAssetConfig(address asset, address pool) external virtual;

    /**
     * @notice Remove configuration for an asset
     * @param asset Asset address
     */
    function removeAssetConfig(address asset) external virtual;

    function getPriceInfo(
        address asset
    ) public view virtual override returns (uint256 price, bool isAlive);

    function getAssetPrice(
        address asset
    ) external view virtual override returns (uint256) {
        (uint256 price, bool isAlive) = getPriceInfo(asset);
        if (!isAlive) revert PriceIsZero(asset);
        return price;
    }

    function _convertToBaseCurrencyUnit(
        uint256 price
    ) internal view returns (uint256) {
        return (price * BASE_CURRENCY_UNIT) / CURVE_BASE_CURRENCY_UNIT;
    }
}
