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

import { DLoopWithdrawerBase, ERC20, IERC3156FlashLender } from "../../DLoopWithdrawerBase.sol";
import { CurveSwapLogic, CurveHelper, ICurveRouterNgPoolsOnlyV1 } from "./CurveSwapLogic.sol";
import { Constants } from "contracts/shared/Constants.sol";

/**
 * @title DLoopWithdrawerCurve
 * @dev Implementation of DLoopWithdrawerBase with Curve swap functionality
 */
contract DLoopWithdrawerCurve is DLoopWithdrawerBase {
    // Immutable state variables
    ICurveRouterNgPoolsOnlyV1 public immutable curveRouter;
    uint256 public maxSlippageSurplusSwapBps;

    // Storage variables
    mapping(string => CurveHelper.CurveSwapExtraParams) public defaultSwapParams;
    mapping(string => bool) public isSwapParamsSet;

    /**
     * @dev Constructor for the DLoopWithdrawerCurve contract
     * @param _flashLender Address of the flash loan provider
     * @param _curveRouter Address of the Curve router
     * @param _defaultSwapParamsList List of default swap parameters
     */
    constructor(
        IERC3156FlashLender _flashLender,
        ICurveRouterNgPoolsOnlyV1 _curveRouter,
        CurveSwapLogic.CurveSwapExtraParamsDefaultConfig[] memory _defaultSwapParamsList
    ) DLoopWithdrawerBase(_flashLender) {
        // Assign immutable variables
        curveRouter = _curveRouter;

        // TODO: hardcoded here, will be removed in the future
        maxSlippageSurplusSwapBps = 20 * Constants.ONE_PERCENT_BPS; // 20% slippage surplus swap

        // Initialize default swap parameters
        CurveSwapLogic.initializeDefaultSwapParams(_defaultSwapParamsList, defaultSwapParams, isSwapParamsSet);
    }

    /**
     * @inheritdoc DLoopWithdrawerBase
     * @dev Swaps an exact amount of output tokens for the minimum input tokens
     */
    function _swapExactOutput(
        ERC20 inputToken,
        ERC20 outputToken,
        uint256 amountOut,
        uint256 amountInMaximum,
        address receiver,
        uint256, // deadline (not used in Curve)
        bytes memory underlyingToDStableSwapData
    ) internal override returns (uint256) {
        return
            CurveSwapLogic.swapExactOutput(
                inputToken,
                outputToken,
                amountOut,
                amountInMaximum,
                maxSlippageSurplusSwapBps,
                receiver,
                underlyingToDStableSwapData,
                curveRouter,
                defaultSwapParams,
                isSwapParamsSet
            );
    }

    /**
     * @dev Sets the swap extra params for a given input and output token
     * @param _swapExtraParamsConfig The swap extra params config
     */
    function setSwapExtraParams(
        CurveSwapLogic.CurveSwapExtraParamsDefaultConfig memory _swapExtraParamsConfig
    ) external onlyOwner {
        CurveSwapLogic.setSwapExtraParams(_swapExtraParamsConfig, defaultSwapParams, isSwapParamsSet);
    }
}
