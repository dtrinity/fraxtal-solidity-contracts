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

pragma solidity ^0.8.20;

import "./interfaces/ICurveRouterWrapper.sol";
import "./interfaces/IRouterNG.sol";
import "../shared/Constants.sol";
import "@openzeppelin/contracts-5/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-5/token/ERC20/IERC20.sol";

/**
 * @title CurveRouterWrapper
 * @dev A contract to facilitate token multi-hop swaps using Curve's RouterNG
 */
contract CurveRouterWrapper is ICurveRouterWrapper {
    using SafeERC20 for IERC20;

    ICurveRouterNG public immutable router;

    uint16 private constant SLIPPAGE_BUFFER_BPS = 1; // 1/100 of a basis point

    constructor(address _router) {
        router = ICurveRouterNG(payable(_router));
    }

    function swapExactIn(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amountIn,
        uint256 minAmountOut,
        address[5] calldata pools,
        address tokenIn
    ) external returns (uint256) {
        // Transfer input tokens from the sender to this contract
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve the router to spend our tokens
        IERC20(tokenIn).approve(address(router), amountIn);

        // Execute the swap
        uint256 amountOut = router.exchange(
            route,
            swapParams,
            amountIn,
            minAmountOut,
            pools,
            msg.sender
        );

        // Ensure the swap was successful
        if (amountOut < minAmountOut) {
            revert ICurveRouterWrapper.InsufficientOutputAmount(
                amountOut,
                minAmountOut
            );
        }

        return amountOut;
    }

    function swapExactOutput(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[5] calldata pools,
        address tokenIn
    ) external returns (uint256) {
        // Calculate the required input amount
        uint256 estimatedAmountIn = router.get_dx(
            route,
            swapParams,
            amountOut,
            pools
        );

        // Add a buffer to account for potential slippage
        uint256 amountIn = (estimatedAmountIn *
            (Constants.ONE_HUNDRED_PERCENT_BPS + SLIPPAGE_BUFFER_BPS)) /
            Constants.ONE_HUNDRED_PERCENT_BPS;

        if (amountIn > maxAmountIn) {
            revert ICurveRouterWrapper.InputAmountExceedsMaximum(
                amountIn,
                maxAmountIn
            );
        }

        // Transfer input tokens from the sender to this contract
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve the router to spend our tokens
        IERC20(tokenIn).approve(address(router), amountIn);

        // Execute the swap
        uint256 actualAmountOut = router.exchange(
            route,
            swapParams,
            amountIn,
            amountOut, // This is now our minimum expected output
            pools,
            msg.sender
        );

        // Ensure the swap was successful
        if (actualAmountOut < amountOut) {
            revert ICurveRouterWrapper.InsufficientOutputAmount(
                actualAmountOut,
                amountOut
            );
        }

        // If there are any unused input tokens, return them to the user
        uint256 unusedAmount = IERC20(tokenIn).balanceOf(address(this));
        if (unusedAmount > 0) {
            IERC20(tokenIn).safeTransfer(msg.sender, unusedAmount);
        }

        return amountIn - unusedAmount;
    }

    function getExpectedOutput(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amountIn,
        address[5] calldata pools
    ) external view returns (uint256) {
        return router.get_dy(route, swapParams, amountIn, pools);
    }

    function getExpectedInput(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amountOut,
        address[5] calldata pools
    ) external view returns (uint256) {
        return router.get_dx(route, swapParams, amountOut, pools);
    }
}
