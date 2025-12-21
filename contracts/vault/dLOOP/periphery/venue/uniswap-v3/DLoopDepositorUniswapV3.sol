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

import { DLoopDepositorBase, ERC20, IERC3156FlashLender } from "../../DLoopDepositorBase.sol";
import { UniswapV3SwapLogic, ISwapRouter } from "./UniswapV3SwapLogic.sol";

/**
 * @title DLoopDepositorUniswapV3
 * @dev Implementation of DLoopDepositorBase with Uniswap V3 swap functionality
 */
contract DLoopDepositorUniswapV3 is DLoopDepositorBase {
    ISwapRouter public immutable swapRouter;

    /**
     * @dev Constructor for the DLoopDepositorUniswapV3 contract
     * @param _flashLender Address of the flash loan provider
     * @param _swapRouter Address of the Uniswap V3 swap router
     */
    constructor(IERC3156FlashLender _flashLender, ISwapRouter _swapRouter) DLoopDepositorBase(_flashLender) {
        swapRouter = _swapRouter;
    }

    /**
     * @inheritdoc DLoopDepositorBase
     * @dev Swaps an exact amount of output tokens for the minimum input tokens
     */
    function _swapExactOutput(
        ERC20 inputToken,
        ERC20 outputToken,
        uint256 amountOut,
        uint256 amountInMaximum,
        address receiver,
        uint256 deadline,
        bytes memory dStableToUnderlyingSwapData
    ) internal override returns (uint256) {
        return
            UniswapV3SwapLogic.swapExactOutput(
                inputToken,
                outputToken,
                amountOut,
                amountInMaximum,
                receiver,
                deadline,
                dStableToUnderlyingSwapData,
                swapRouter
            );
    }
}
