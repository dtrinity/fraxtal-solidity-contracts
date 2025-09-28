// SPDX-License-Identifier: AGPL-3.0
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

pragma solidity ^0.8.10;

import { SafeERC20 } from "contracts/lending/core/dependencies/openzeppelin/contracts/SafeERC20.sol";
import { SafeMath } from "contracts/lending/core/dependencies/openzeppelin/contracts/SafeMath.sol";
import { PercentageMath } from "contracts/lending/core/protocol/libraries/math/PercentageMath.sol";
import { IPoolAddressesProvider } from "contracts/lending/core/interfaces/IPoolAddressesProvider.sol";
import { IERC20Detailed } from "contracts/lending/core/dependencies/openzeppelin/contracts/IERC20Detailed.sol";
import { BaseDSwapAdapter } from "./BaseDSwapAdapter.sol";
import { ISwapRouter } from "./interfaces/ISwapRouter.sol";
import { TransferHelper } from "./TransferHelper.sol";

/**
 * @title BaseDSwapSellAdapter
 * @notice Implements the logic for selling tokens on dSwap
 */
abstract contract BaseDSwapSellAdapter is BaseDSwapAdapter {
    using PercentageMath for uint256;
    using SafeMath for uint256;
    using SafeERC20 for IERC20Detailed;
    ISwapRouter public immutable swapRouter;

    constructor(IPoolAddressesProvider addressesProvider, ISwapRouter _swapRouter) BaseDSwapAdapter(addressesProvider) {
        swapRouter = _swapRouter;
    }

    /**
     * @dev Swaps a token for another using Swap Router
     * @param assetToSwapFrom Address of the asset to be swapped from
     * @param assetToSwapTo Address of the asset to be swapped to
     * @param amountToSwap Amount to be swapped
     * @param minAmountToReceive Minimum amount to be received from the swap
     * @param path Multi-hop path of the swap
     * @return amountReceived The amount received from the swap
     */
    function _sellOnDSwap(
        IERC20Detailed assetToSwapFrom,
        IERC20Detailed assetToSwapTo,
        uint256 amountToSwap,
        uint256 minAmountToReceive,
        bytes memory path
    ) internal returns (uint256 amountReceived) {
        uint256 balanceBeforeAssetFrom = assetToSwapFrom.balanceOf(address(this));
        require(balanceBeforeAssetFrom >= amountToSwap, "INSUFFICIENT_BALANCE_BEFORE_SWAP");
        address tokenIn = address(assetToSwapFrom);
        address tokenOut = address(assetToSwapTo);

        TransferHelper.safeApprove(tokenIn, address(swapRouter), amountToSwap);

        ISwapRouter.ExactInputParams memory params = ISwapRouter.ExactInputParams({
            path: path,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountToSwap,
            amountOutMinimum: minAmountToReceive
        });

        amountReceived = swapRouter.exactInput(params);

        emit Swapped(tokenIn, tokenOut, amountToSwap, amountReceived);
    }
}
