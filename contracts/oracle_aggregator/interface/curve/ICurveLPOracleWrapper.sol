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
 * @title ICurveLPOracleWrapper
 * @notice Interface for Curve LP token oracle wrapper
 */
abstract contract ICurveLPOracleWrapper is IOracleWrapper, AccessControl {
    /* Structs */
    
    struct LPConfig {
        address pool;           // Curve pool address
        address baseAsset;      // Base asset for pricing (e.g., USDC)
        uint8 baseAssetIndex;   // Index of base asset in pool
    }

    /* Core state */

    /// @notice Base currency unit (e.g. 1e8 if using Aave's oracle decimals)
    uint256 public immutable BASE_CURRENCY_UNIT;

    uint256 public constant CURVE_BASE_CURRENCY_UNIT = 10 ** 18;

    /// @notice Base currency (address(0) for USD)
    address public constant BASE_CURRENCY = address(0);

    /* Events */

    event LPConfigSet(
        address indexed lpToken,
        address indexed pool,
        address indexed baseAsset,
        uint8 baseAssetIndex
    );
    event LPConfigRemoved(address indexed lpToken);

    /* Errors */

    error LPTokenNotConfigured(address lpToken);
    error InvalidPool(address pool);
    error InvalidAddress();
    error NotStableSwapPool(address pool);
    error LPTokenMismatch(address lpToken, address pool);
    error BaseAssetNotInPool(address baseAsset, address pool);
    error PriceIsZero(address lpToken);

    /* Roles */

    bytes32 public constant ORACLE_MANAGER_ROLE =
        keccak256("ORACLE_MANAGER_ROLE");

    constructor(uint256 _baseCurrencyUnit) {
        BASE_CURRENCY_UNIT = _baseCurrencyUnit;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_MANAGER_ROLE, msg.sender);
    }

    /**
     * @notice Set or update configuration for an LP token
     * @param lpToken LP token address
     * @param pool Curve pool address
     * @param baseAsset Base asset to use for pricing
     */
    function setLPConfig(
        address lpToken,
        address pool,
        address baseAsset
    ) external virtual;

    /**
     * @notice Remove configuration for an LP token
     * @param lpToken LP token address
     */
    function removeLPConfig(address lpToken) external virtual;

    function getPriceInfo(
        address lpToken
    ) public view virtual override returns (uint256 price, bool isAlive);

    function getAssetPrice(
        address lpToken
    ) external view virtual override returns (uint256);
}