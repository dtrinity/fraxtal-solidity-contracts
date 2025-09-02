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

import "../interface/IOracleWrapper.sol";
import "../interface/curve/ICurveStableNG.sol";
import "./CurveLPBaseWrapper.sol";

/**
 * @title CurveLPHardPegOracleWrapper
 * @notice Oracle wrapper for Curve StableSwap LP tokens that assumes hard peg (1 USD per coin)
 * @dev Uses only virtual price as source of truth and converts to BASE_CURRENCY_UNIT.
 *      Ignores depegs and external price feeds entirely.
 */
contract CurveLPHardPegOracleWrapper is IOracleWrapper, CurveLPBaseWrapper {
    /* Constants */

    /* Core state */

    /// @notice Mapping from LP token to configuration
    mapping(address => LPConfig) public lpConfigs;

    constructor(
        uint256 _baseCurrencyUnit
    ) CurveLPBaseWrapper(_baseCurrencyUnit) {}

    function setLPConfig(
        address lpToken,
        address pool
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        if (lpToken == address(0) || pool == address(0))
            revert InvalidAddress();
        _verifyStableSwapNG(pool);
        if (lpToken != pool) revert LPTokenMismatch(lpToken, pool);

        lpConfigs[lpToken] = LPConfig({pool: pool});
        emit LPConfigSet(lpToken, pool, address(0), 0);
    }

    function removeLPConfig(
        address lpToken
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        delete lpConfigs[lpToken];
        emit LPConfigRemoved(lpToken);
    }

    function getPriceInfo(
        address lpToken
    ) public view override returns (uint256 price, bool isAlive) {
        LPConfig storage config = lpConfigs[lpToken];
        if (config.pool == address(0)) {
            revert LPTokenNotConfigured(lpToken);
        }

        // Get virtual price from Curve pool (1e18)
        uint256 virtualPrice = ICurveStableNG(config.pool).get_virtual_price();

        // Convert to BASE_CURRENCY_UNIT under hard-peg assumption (1 USD per unit)
        price =
            (virtualPrice * BASE_CURRENCY_UNIT()) /
            CURVE_BASE_CURRENCY_UNIT;
        isAlive = price > 0;
        return (price, isAlive);
    }

    function getAssetPrice(
        address lpToken
    ) external view override returns (uint256) {
        (uint256 price, bool isAlive) = getPriceInfo(lpToken);
        if (!isAlive) revert PriceIsZero(lpToken);
        return price;
    }

    // Disambiguate multiple inheritance for IPriceOracleGetter
    function BASE_CURRENCY()
        public
        pure
        override(CurveLPBaseWrapper, IPriceOracleGetter)
        returns (address)
    {
        return BASE_CURRENCY_ADDR;
    }

    function BASE_CURRENCY_UNIT()
        public
        view
        override(CurveLPBaseWrapper, IPriceOracleGetter)
        returns (uint256)
    {
        return baseCurrencyUnit;
    }
}
