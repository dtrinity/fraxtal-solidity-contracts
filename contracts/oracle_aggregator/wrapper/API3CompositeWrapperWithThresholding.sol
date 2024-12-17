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

import "../interface/api3/IAPI3Wrapper.sol";
import "@openzeppelin/contracts-5/access/AccessControl.sol";
import {IProxy} from "../interface/api3/IProxy.sol";

contract API3CompositeWrapperWithThresholding is IAPI3Wrapper {
    /* Core state */

    struct CompositeFeed {
        address proxy1;
        address proxy2;
        uint256 lowerThresholdInBase1;
        uint256 fixedPriceInBase1;
        uint256 lowerThresholdInBase2;
        uint256 fixedPriceInBase2;
    }

    mapping(address => CompositeFeed) public compositeFeeds;

    /* Events */

    event CompositeFeedAdded(
        address indexed asset,
        address proxy1,
        address proxy2,
        uint256 lowerThresholdInBase1,
        uint256 fixedPriceInBase1,
        uint256 lowerThresholdInBase2,
        uint256 fixedPriceInBase2
    );
    event CompositeFeedRemoved(address indexed asset);
    event CompositeFeedUpdated(
        address indexed asset,
        uint256 lowerThresholdInBase1,
        uint256 fixedPriceInBase1,
        uint256 lowerThresholdInBase2,
        uint256 fixedPriceInBase2
    );

    /* Errors */

    error FeedNotSet(address asset);

    constructor(uint256 _baseCurrencyUnit) IAPI3Wrapper(_baseCurrencyUnit) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_MANAGER_ROLE, msg.sender);
    }

    function addCompositeFeed(
        address asset,
        address proxy1,
        address proxy2,
        uint256 lowerThresholdInBase1,
        uint256 fixedPriceInBase1,
        uint256 lowerThresholdInBase2,
        uint256 fixedPriceInBase2
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        compositeFeeds[asset] = CompositeFeed(
            proxy1,
            proxy2,
            lowerThresholdInBase1,
            fixedPriceInBase1,
            lowerThresholdInBase2,
            fixedPriceInBase2
        );
        emit CompositeFeedAdded(
            asset,
            proxy1,
            proxy2,
            lowerThresholdInBase1,
            fixedPriceInBase1,
            lowerThresholdInBase2,
            fixedPriceInBase2
        );
    }

    function removeCompositeFeed(
        address asset
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        delete compositeFeeds[asset];
        emit CompositeFeedRemoved(asset);
    }

    function updateCompositeFeed(
        address asset,
        uint256 lowerThresholdInBase1,
        uint256 fixedPriceInBase1,
        uint256 lowerThresholdInBase2,
        uint256 fixedPriceInBase2
    ) external onlyRole(ORACLE_MANAGER_ROLE) {
        CompositeFeed storage feed = compositeFeeds[asset];
        if (feed.proxy1 == address(0) || feed.proxy2 == address(0)) {
            revert FeedNotSet(asset);
        }
        feed.lowerThresholdInBase1 = lowerThresholdInBase1;
        feed.fixedPriceInBase1 = fixedPriceInBase1;
        feed.lowerThresholdInBase2 = lowerThresholdInBase2;
        feed.fixedPriceInBase2 = fixedPriceInBase2;
        emit CompositeFeedUpdated(
            asset,
            lowerThresholdInBase1,
            fixedPriceInBase1,
            lowerThresholdInBase2,
            fixedPriceInBase2
        );
    }

    function getPriceInfo(
        address asset
    ) public view override returns (uint256 price, bool isAlive) {
        CompositeFeed memory feed = compositeFeeds[asset];
        if (feed.proxy1 == address(0) || feed.proxy2 == address(0)) {
            revert FeedNotSet(asset);
        }

        (int224 value1, uint32 timestamp1) = IProxy(feed.proxy1).read();
        (int224 value2, uint32 timestamp2) = IProxy(feed.proxy2).read();

        uint256 api3Price1 = value1 > 0 ? uint256(uint224(value1)) : 0;
        uint256 api3Price2 = value2 > 0 ? uint256(uint224(value2)) : 0;

        uint256 priceInBase1 = _convertToBaseCurrencyUnit(api3Price1);
        uint256 priceInBase2 = _convertToBaseCurrencyUnit(api3Price2);

        // Apply thresholding to individual prices if specified
        if (feed.lowerThresholdInBase1 > 0) {
            api3Price1 = _applyThreshold(
                api3Price1,
                feed.lowerThresholdInBase1,
                feed.fixedPriceInBase1
            );
        }
        if (feed.lowerThresholdInBase2 > 0) {
            priceInBase2 = _applyThreshold(
                priceInBase2,
                feed.lowerThresholdInBase2,
                feed.fixedPriceInBase2
            );
        }

        price = (priceInBase1 * priceInBase2) / BASE_CURRENCY_UNIT;
        isAlive =
            price > 0 &&
            block.timestamp - timestamp1 <=
            API3_HEARTBEAT + heartbeatStaleTimeLimit &&
            block.timestamp - timestamp2 <=
            API3_HEARTBEAT + heartbeatStaleTimeLimit;
    }

    function getAssetPrice(
        address asset
    ) external view override returns (uint256) {
        (uint256 price, bool isAlive) = getPriceInfo(asset);
        if (!isAlive) {
            revert PriceIsStale();
        }
        return price;
    }

    function _applyThreshold(
        uint256 priceInBase,
        uint256 lowerThresholdInBase,
        uint256 fixedPriceInBase
    ) internal pure returns (uint256) {
        if (priceInBase > lowerThresholdInBase) {
            return fixedPriceInBase;
        }
        return priceInBase;
    }
}
