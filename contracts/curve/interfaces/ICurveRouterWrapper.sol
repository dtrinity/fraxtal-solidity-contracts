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

import "./IRouterNG.sol";

interface ICurveRouterWrapper {
    error InsufficientOutputAmount(uint256 amountOut, uint256 minAmountOut);
    error InputAmountExceedsMaximum(uint256 amountIn, uint256 maxAmountIn);

    function router() external view returns (ICurveRouterNG);

    /**
     * @dev Executes a token swap on Curve with exact input
     * @param route The route of the swap
     * @param swapParams The swap parameters
     * @param amountIn The exact amount of input tokens
     * @param minAmountOut The minimum amount of output tokens to receive
     * @param pools The pools to use for the swap
     * @param tokenIn The address of the input token
     * @return The amount of output tokens received
     */
    function swapExactIn(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amountIn,
        uint256 minAmountOut,
        address[5] calldata pools,
        address tokenIn
    ) external returns (uint256);

    /**
     * @dev Executes a token swap on Curve with exact output
     * @param route The route of the swap
     * @param swapParams The swap parameters
     * @param amountOut The exact amount of output tokens to receive
     * @param maxAmountIn The maximum amount of input tokens to spend
     * @param pools The pools to use for the swap
     * @param tokenIn The address of the input token
     * @return The amount of input tokens spent
     */
    function swapExactOutput(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amountOut,
        uint256 maxAmountIn,
        address[5] calldata pools,
        address tokenIn
    ) external returns (uint256);

    /**
     * @dev Gets the expected output amount for a swap
     * @param route The route of the swap
     * @param swapParams The swap parameters
     * @param amountIn The amount of input tokens
     * @param pools The pools to use for the swap
     * @return The expected amount of output tokens
     */
    function getExpectedOutput(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amountIn,
        address[5] calldata pools
    ) external view returns (uint256);

    /**
     * @dev Gets the expected input amount for a desired output amount
     * @param route The route of the swap
     * @param swapParams The swap parameters
     * @param amountOut The desired amount of output tokens
     * @param pools The pools to use for the swap
     * @return The expected amount of input tokens required
     */
    function getExpectedInput(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amountOut,
        address[5] calldata pools
    ) external view returns (uint256);
}
