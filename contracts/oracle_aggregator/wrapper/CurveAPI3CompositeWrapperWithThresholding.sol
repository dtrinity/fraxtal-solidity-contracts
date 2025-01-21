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

import "./CurveOracleWrapper.sol";
import "./API3Wrapper.sol";
import "./ThresholdingUtils.sol";

/**
 * @title CurveAPI3CompositeWrapperWithThresholding
 * @notice Oracle wrapper that combines Curve pool prices with API3 prices and applies thresholding
 * @dev Used when Curve pool prices need to be converted using another token's price from API3
 */
contract CurveAPI3CompositeWrapperWithThresholding is
    CurveOracleWrapper,
    ThresholdingUtils
{
    /* Errors */
    error API3InvalidPrice(address asset);

    /* Types */
    struct CompositeFeed {
        address api3Asset; // Asset to get price from API3
        address api3Wrapper; // API3 wrapper contract address
        CompositeThresholdFeed thresholds;
    }

    /* State */

    /// @notice Mapping from asset to composite feed configuration
    mapping(address => CompositeFeed) public compositeFeeds;

    /* Events */

    event CompositeFeedSet(
        address indexed asset,
        address indexed api3Asset,
        address indexed api3Wrapper,
        uint256 curveLowerThresholdInBase,
        uint256 curveFixedPriceInBase,
        uint256 api3LowerThresholdInBase,
        uint256 api3FixedPriceInBase
    );

    event CompositeFeedRemoved(address indexed asset);

    constructor(
        uint256 _baseCurrencyUnit
    ) CurveOracleWrapper(_baseCurrencyUnit) {}

    /**
     * @notice Set or update composite feed configuration for an asset
     */
    function setCompositeFeed(
        address asset,
        address api3Asset,
        address api3Wrapper,
        uint256 curveLowerThresholdInBase,
        uint256 curveFixedPriceInBase,
        uint256 api3LowerThresholdInBase,
        uint256 api3FixedPriceInBase
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        // Verify the asset is configured in Curve wrapper
        PoolConfig memory poolConfig = assetConfigs[asset];
        if (address(poolConfig.pool) == address(0))
            revert AssetNotConfigured(asset);

        // Verify API3 wrapper can provide a price
        (, bool isAlive) = API3Wrapper(api3Wrapper).getPriceInfo(api3Asset);
        if (!isAlive) revert API3InvalidPrice(api3Asset);

        compositeFeeds[asset] = CompositeFeed({
            api3Asset: api3Asset,
            api3Wrapper: api3Wrapper,
            thresholds: CompositeThresholdFeed({
                primary: ThresholdConfig({
                    lowerThresholdInBase: curveLowerThresholdInBase,
                    fixedPriceInBase: curveFixedPriceInBase
                }),
                secondary: ThresholdConfig({
                    lowerThresholdInBase: api3LowerThresholdInBase,
                    fixedPriceInBase: api3FixedPriceInBase
                })
            })
        });

        emit CompositeFeedSet(
            asset,
            api3Asset,
            api3Wrapper,
            curveLowerThresholdInBase,
            curveFixedPriceInBase,
            api3LowerThresholdInBase,
            api3FixedPriceInBase
        );
    }

    /**
     * @notice Remove composite feed configuration for an asset
     * @param asset Asset address
     */
    function removeCompositeFeed(
        address asset
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        delete compositeFeeds[asset];
        emit CompositeFeedRemoved(asset);
    }

    /**
     * @notice Get the composite price info for an asset
     */
    function getPriceInfo(
        address asset
    ) public view override returns (uint256 price, bool isAlive) {
        // Get Curve pool price
        (uint256 curvePrice, bool curveAlive) = super.getPriceInfo(asset);
        if (!curveAlive) return (0, false);

        CompositeFeed memory feed = compositeFeeds[asset];

        // Apply threshold to Curve price if threshold is configured
        if (feed.thresholds.primary.lowerThresholdInBase > 0) {
            curvePrice = _applyThreshold(curvePrice, feed.thresholds.primary);
        }

        // If no composite feed for API3, return Curve price
        if (feed.api3Asset == address(0)) {
            return (curvePrice, true);
        }

        // Get API3 price
        (uint256 api3Price, bool api3Alive) = API3Wrapper(feed.api3Wrapper)
            .getPriceInfo(feed.api3Asset);
        if (!api3Alive) return (0, false);

        // Apply threshold to API3 price if threshold is configured
        if (feed.thresholds.secondary.lowerThresholdInBase > 0) {
            api3Price = _applyThreshold(api3Price, feed.thresholds.secondary);
        }

        // Calculate composite price
        return ((curvePrice * api3Price) / BASE_CURRENCY_UNIT, true);
    }
}
