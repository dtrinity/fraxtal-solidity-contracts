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

import "../interface/curve/ICurveStableNG.sol";
import "../interface/IOracleWrapper.sol";
import "./CurveLPBaseWrapper.sol";

/**
 * @title CurveLPWeightedOracleWrapper
 * @notice Oracle wrapper for Curve StableSwap LP tokens that enforces composition-weighted USD anchoring.
 * @dev Requires per-coin anchors to be configured; no single-asset fallback is allowed.
 */
contract CurveLPWeightedOracleWrapper is IOracleWrapper, CurveLPBaseWrapper {
    /* Constants */

    uint256 private constant CURVE_RATE_PRECISION = 10 ** 18;

    /* Core state */

    IOracleWrapper public immutable oracleAggregator;

    mapping(address => LPConfig) public lpConfigs;
    mapping(address => address[]) public lpAnchorAssets;

    event LPAnchorAssetsSet(address indexed lpToken, address[] anchorAssets);

    // Custom errors
    error AnchorsRequired();

    constructor(
        uint256 _baseCurrencyUnit,
        address _oracleAggregator
    ) CurveLPBaseWrapper(_baseCurrencyUnit) {
        if (_oracleAggregator == address(0)) revert InvalidAddress();
        oracleAggregator = IOracleWrapper(_oracleAggregator);
    }

    function setLPConfig(
        address,
        address,
        address
    ) external view onlyRole(ORACLE_MANAGER_ROLE) {
        revert AnchorsRequired();
    }

    /**
     * @notice Configure an LP with full anchor assets in one transaction
     * @param lpToken The LP token address (must equal pool for NG pools)
     * @param pool The Curve StableSwap-NG pool address
     * @param anchorAssets Anchor asset addresses for each pool coin index (must match N_COINS length)
     */
    function setLPFullConfig(
        address lpToken,
        address pool,
        address[] calldata anchorAssets
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        if (lpToken == address(0) || pool == address(0))
            revert InvalidAddress();

        // Verify StableSwap-NG pool
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

        if (lpToken != pool) revert LPTokenMismatch(lpToken, pool);

        ICurveStableNG poolContract = ICurveStableNG(pool);
        uint256 nCoins;
        try poolContract.N_COINS() returns (uint256 n) {
            nCoins = n;
        } catch {
            revert InvalidPool(pool);
        }
        if (anchorAssets.length != nCoins) revert InvalidAddress();

        // Validate anchors are non-zero and priceable
        for (uint256 i; i < anchorAssets.length; ) {
            address anchor = anchorAssets[i];
            if (anchor == address(0)) revert InvalidAddress();
            // Probe oracle aggregator liveness for early validation
            (, bool alive) = oracleAggregator.getPriceInfo(anchor);
            if (!alive) revert PriceIsZero(anchor);
            unchecked {
                ++i;
            }
        }

        // Store config
        lpConfigs[lpToken] = LPConfig({pool: pool});

        // Store anchors
        delete lpAnchorAssets[lpToken];
        for (uint256 i; i < anchorAssets.length; ) {
            lpAnchorAssets[lpToken].push(anchorAssets[i]);
            unchecked {
                ++i;
            }
        }

        emit LPConfigSet(lpToken, pool, address(0), 0);
        emit LPAnchorAssetsSet(lpToken, anchorAssets);
    }

    function setLPAnchorAssets(
        address lpToken,
        address[] calldata anchorAssets
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        LPConfig storage config = lpConfigs[lpToken];
        if (config.pool == address(0)) revert LPTokenNotConfigured(lpToken);

        ICurveStableNG pool = ICurveStableNG(config.pool);
        uint256 nCoins;
        try pool.N_COINS() returns (uint256 n) {
            nCoins = n;
        } catch {
            revert InvalidPool(config.pool);
        }
        if (anchorAssets.length != nCoins) revert InvalidAddress();
        for (uint256 i; i < anchorAssets.length; ) {
            if (anchorAssets[i] == address(0)) revert InvalidAddress();
            unchecked {
                ++i;
            }
        }

        delete lpAnchorAssets[lpToken];
        for (uint256 i; i < anchorAssets.length; ) {
            lpAnchorAssets[lpToken].push(anchorAssets[i]);
            unchecked {
                ++i;
            }
        }

        emit LPAnchorAssetsSet(lpToken, anchorAssets);
    }

    function removeLPConfig(
        address lpToken
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        delete lpConfigs[lpToken];
        delete lpAnchorAssets[lpToken];
        emit LPConfigRemoved(lpToken);
    }

    function getPriceInfo(
        address lpToken
    ) public view override returns (uint256 price, bool isAlive) {
        LPConfig storage config = lpConfigs[lpToken];
        if (config.pool == address(0)) revert LPTokenNotConfigured(lpToken);

        address[] storage anchors = lpAnchorAssets[lpToken];
        if (anchors.length == 0) revert InvalidAddress(); // weighted wrapper requires anchors

        uint256 virtualPrice = ICurveStableNG(config.pool).get_virtual_price();

        uint256[] memory balances = ICurveStableNG(config.pool).get_balances();
        uint256[] memory rates = ICurveStableNG(config.pool).stored_rates();

        uint256 totalXp;
        uint256 weightedSum;
        for (uint256 i; i < anchors.length; ) {
            uint256 rate = rates.length > i ? rates[i] : CURVE_RATE_PRECISION;
            uint256 xp = (balances[i] * rate) / CURVE_RATE_PRECISION;

            (uint256 anchorPrice, bool alive) = oracleAggregator.getPriceInfo(
                anchors[i]
            );
            if (!alive) return (0, false);

            totalXp += xp;
            weightedSum += anchorPrice * xp;
            unchecked {
                ++i;
            }
        }
        if (totalXp == 0) return (0, false);

        uint256 weightedAvgPrice = weightedSum / totalXp; // in BASE_CURRENCY_UNIT
        price =
            (virtualPrice * BASE_CURRENCY_UNIT() * weightedAvgPrice) /
            (CURVE_BASE_CURRENCY_UNIT * BASE_CURRENCY_UNIT());
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
