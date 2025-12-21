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

import { ERC20, SafeERC20 } from "@openzeppelin/contracts-5/token/ERC20/extensions/ERC4626.sol";
import { ISwapRouter } from "contracts/dex/periphery/interfaces/ISwapRouter.sol";

/**
 * @title UniswapV3SwapLogic
 * @dev Library for common Uniswap V3-related functions used in dLOOP contracts
 */
library UniswapV3SwapLogic {
    using SafeERC20 for ERC20;

    error EmptyExtraData();

    /**
     * @dev Swaps an exact amount of output tokens for input tokens using Uniswap V3 protocol
     * @param inputToken Input token to be swapped
     * @param amountOut Exact amount of output tokens to receive
     * @param amountInMaximum Maximum amount of input tokens to spend
     * @param receiver Address to receive the output tokens
     * @param deadline Deadline for the swap
     * @param extraData Additional data for the swap (swap path)
     * @param swapRouter Uniswap V3 swap router
     * @return uint256 Amount of input tokens used
     */
    function swapExactOutput(
        ERC20 inputToken,
        ERC20, // outputToken is not used in this function
        uint256 amountOut,
        uint256 amountInMaximum,
        address receiver,
        uint256 deadline,
        bytes memory extraData,
        ISwapRouter swapRouter
    ) external returns (uint256) {
        bytes memory swapPath;

        // Use custom path if provided, otherwise use default path
        if (extraData.length == 0) {
            revert EmptyExtraData();
        } else {
            swapPath = extraData;
        }

        // Approve the swap router to spend the input token
        require(inputToken.approve(address(swapRouter), amountInMaximum), "approve failed for swap router");

        // Swap from the input token to the output token
        uint256 inputTokenUsedInSwap = swapRouter.exactOutput(
            ISwapRouter.ExactOutputParams({
                path: swapPath,
                recipient: receiver,
                deadline: deadline,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum
            })
        );

        return inputTokenUsedInSwap;
    }
}
