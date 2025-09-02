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

import "@openzeppelin/contracts-5/access/AccessControl.sol";
import "../interface/curve/ICurveStableNG.sol";

/**
 * @title CurveLPBaseWrapper
 * @notice Shared base for Curve LP oracle wrappers
 */
abstract contract CurveLPBaseWrapper is AccessControl {
    /* Core state */

    /// @notice Base currency unit (e.g. 1e8 if using Aave's oracle decimals)
    uint256 internal immutable baseCurrencyUnit;

    /// @notice Curve math uses 1e18 fixed point
    uint256 public constant CURVE_BASE_CURRENCY_UNIT = 10 ** 18;

    /// @notice Base currency (address(0) for USD)
    address internal constant BASE_CURRENCY_ADDR = address(0);

    /* Roles */
    bytes32 public constant ORACLE_MANAGER_ROLE =
        keccak256("ORACLE_MANAGER_ROLE");

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
    error PriceIsZero(address asset);

    /* Minimal config for wrappers */
    struct LPConfig {
        address pool;
    }

    constructor(uint256 _baseCurrencyUnit) {
        baseCurrencyUnit = _baseCurrencyUnit;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_MANAGER_ROLE, msg.sender);
    }

    /**
     * @dev Verifies the pool exposes StableSwap-NG interfaces we rely upon
     */
    function _verifyStableSwapNG(address pool) internal view {
        if (pool == address(0)) revert InvalidAddress();
        // Probe NG functions
        try ICurveStableNG(pool).get_virtual_price() returns (
            uint256
        ) {} catch {
            revert NotStableSwapPool(pool);
        }
        try ICurveStableNG(pool).D_oracle() returns (uint256) {} catch {
            revert NotStableSwapPool(pool);
        }
        try ICurveStableNG(pool).stored_rates() returns (
            uint256[] memory
        ) {} catch {
            revert NotStableSwapPool(pool);
        }
    }

    // Expose IPriceOracleGetter-required functions
    function BASE_CURRENCY() public pure virtual returns (address) {
        return BASE_CURRENCY_ADDR;
    }

    function BASE_CURRENCY_UNIT() public view virtual returns (uint256) {
        return baseCurrencyUnit;
    }
}
