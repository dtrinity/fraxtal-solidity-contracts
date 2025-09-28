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
import { IProxy } from "../interface/api3/IProxy.sol";
import "./ThresholdingUtils.sol";

/**
 * @title CurveAPI3CompositeWrapperWithThresholding
 * @notice Oracle wrapper that combines Curve pool prices with API3 prices and applies thresholding
 * @dev Used when Curve pool prices need to be converted using another token's price from API3
 */
contract CurveAPI3CompositeWrapperWithThresholding is CurveOracleWrapper, ThresholdingUtils {
    /* Constants */
    uint32 public constant API3_HEARTBEAT = 1 days;
    uint32 public heartbeatStaleTimeLimit = 1 hours;

    /* Errors */
    error API3InvalidPrice(address asset);

    /* Types */
    struct CompositeFeed {
        address api3Asset; // Asset to get price from API3
        address api3Proxy; // API3 proxy contract address
        ThresholdConfig curveThreshold; // Threshold config for Curve price
        ThresholdConfig api3Threshold; // Threshold config for API3 price
    }

    /* State */

    /// @notice Mapping from asset to composite feed configuration
    mapping(address => CompositeFeed) public compositeFeeds;

    /* Events */

    event CompositeFeedSet(
        address indexed asset,
        address indexed api3Asset,
        address indexed api3Proxy,
        uint256 curveLowerThresholdInBase,
        uint256 curveFixedPriceInBase,
        uint256 api3LowerThresholdInBase,
        uint256 api3FixedPriceInBase
    );

    event CompositeFeedRemoved(address indexed asset);

    constructor(uint256 _baseCurrencyUnit) CurveOracleWrapper(_baseCurrencyUnit) {}

    /**
     * @notice Set or update composite feed configuration for an asset
     */
    function setCompositeFeed(
        address asset,
        address api3Asset,
        address api3Proxy,
        uint256 curveLowerThresholdInBase,
        uint256 curveFixedPriceInBase,
        uint256 api3LowerThresholdInBase,
        uint256 api3FixedPriceInBase
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        // Verify the asset is configured in Curve wrapper
        PoolConfig memory poolConfig = assetConfigs[asset];
        if (address(poolConfig.pool) == address(0)) revert AssetNotConfigured(asset);

        // Verify API3 proxy can provide a price
        (int224 value, uint32 timestamp) = IProxy(api3Proxy).read();
        if (value <= 0 || timestamp + API3_HEARTBEAT + heartbeatStaleTimeLimit <= block.timestamp) {
            revert API3InvalidPrice(api3Asset);
        }

        compositeFeeds[asset] = CompositeFeed({
            api3Asset: api3Asset,
            api3Proxy: api3Proxy,
            curveThreshold: ThresholdConfig({
                lowerThresholdInBase: curveLowerThresholdInBase,
                fixedPriceInBase: curveFixedPriceInBase
            }),
            api3Threshold: ThresholdConfig({
                lowerThresholdInBase: api3LowerThresholdInBase,
                fixedPriceInBase: api3FixedPriceInBase
            })
        });

        emit CompositeFeedSet(
            asset,
            api3Asset,
            api3Proxy,
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
    function removeCompositeFeed(address asset) external onlyRole(ORACLE_MANAGER_ROLE) {
        delete compositeFeeds[asset];
        emit CompositeFeedRemoved(asset);
    }

    /**
     * @notice Get the composite price info for an asset
     */
    function getPriceInfo(address asset) public view override returns (uint256 priceInBase, bool isAlive) {
        // Get Curve pool price
        (uint256 curvePriceInBase, bool curveAlive) = super.getPriceInfo(asset);
        if (!curveAlive) return (0, false);

        CompositeFeed memory feed = compositeFeeds[asset];

        // Apply threshold to Curve price if threshold is configured
        if (feed.curveThreshold.lowerThresholdInBase > 0) {
            curvePriceInBase = _applyThreshold(curvePriceInBase, feed.curveThreshold);
        }

        // If no composite feed for API3, return Curve price
        if (feed.api3Asset == address(0)) {
            return (curvePriceInBase, true);
        }

        // Get API3 price
        (int224 value, uint32 timestamp) = IProxy(feed.api3Proxy).read();
        bool api3Alive = value > 0 && timestamp + API3_HEARTBEAT + heartbeatStaleTimeLimit > block.timestamp;
        if (!api3Alive) return (0, false);

        uint256 api3PriceInBase = _convertToBaseCurrencyUnit(uint256(uint224(value)));

        // Apply threshold to API3 price if threshold is configured
        if (feed.api3Threshold.lowerThresholdInBase > 0) {
            api3PriceInBase = _applyThreshold(api3PriceInBase, feed.api3Threshold);
        }

        // Calculate composite price
        return ((curvePriceInBase * api3PriceInBase) / BASE_CURRENCY_UNIT, true);
    }
}
