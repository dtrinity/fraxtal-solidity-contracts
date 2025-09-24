// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.20;

import { ICurveRouterNgPoolsOnlyV1 } from "contracts/curve/interfaces/ICurveRouterNgPoolsOnlyV1.sol";
import { ICurveRouterWrapper } from "contracts/curve/interfaces/ICurveRouterWrapper.sol";
import { Constants } from "contracts/shared/Constants.sol";
import { ERC20 } from "@rari-capital/solmate/src/tokens/ERC20.sol";

library CurveHelper {
    /// @notice Get the last non-zero token in the route
    function getLastTokenInRoute(address[11] memory route) public pure returns (address) {
        for (uint256 i = route.length - 1; i >= 0; i--) {
            if (route[i] != address(0)) {
                return route[i];
            }
        }
        revert("No token in route");
    }

    struct CurveSwapExtraParams {
        address[11] route;
        uint256[4][5] swapParams;
        uint256 swapSlippageBufferBps;
    }

    function decodeCurveSwapExtraParams(
        bytes memory data
    ) public pure returns (CurveSwapExtraParams memory _swapExtraParams) {
        (_swapExtraParams.route, _swapExtraParams.swapParams, _swapExtraParams.swapSlippageBufferBps) = abi.decode(
            data,
            (address[11], uint256[4][5], uint256)
        );
    }

    function swapExactOutput(
        ICurveRouterNgPoolsOnlyV1 _curveRouter,
        address[11] memory _route,
        uint256[4][5] memory _swapParams,
        address[11] memory _reverseRoute,
        uint256[4][5] memory _reverseSwapParams,
        uint256 swapSlippageBufferBps,
        uint256 maxSlippageSurplusSwapBps,
        uint256 _amountOutput,
        uint256 _maxInputAmount
    ) public returns (uint256) {
        // As Curve does not support exact output swaps, we need to calculate the required input amount
        // and add a buffer to account for potential slippage. Then swapping back the surplus amount

        address inputToken = _route[0];

        // Calculate the required input amount
        uint256 estimatedAmountIn = _curveRouter.get_dx(_route, _swapParams, _amountOutput);

        // Add a buffer to account for potential slippage
        uint256 amountIn = (estimatedAmountIn * (Constants.ONE_HUNDRED_PERCENT_BPS + swapSlippageBufferBps)) /
            Constants.ONE_HUNDRED_PERCENT_BPS;

        // amountIn cannot exceed current balance of input token
        uint256 inputTokenBalance = ERC20(inputToken).balanceOf(address(this));
        if (amountIn > inputTokenBalance) {
            amountIn = inputTokenBalance;
        }

        if (amountIn > _maxInputAmount) {
            revert ICurveRouterWrapper.InputAmountExceedsMaximum(amountIn, _maxInputAmount);
        }

        // Input token balance before the swap
        uint256 inputTokenBalanceBefore = ERC20(inputToken).balanceOf(address(this));

        // Approve the router to spend our tokens
        ERC20(inputToken).approve(address(_curveRouter), _maxInputAmount);

        // Execute the swap
        uint256 actualAmountOut = _curveRouter.exchange(
            _route,
            _swapParams,
            amountIn,
            _amountOutput, // This is now our minimum expected output
            address(this) // The receiver of the output tokens
        );

        // Get the difference between the actual and expected output
        uint256 redundantAmount = actualAmountOut - _amountOutput;

        // Swap the redundant amount back to the input token with the reverse route
        if (redundantAmount > 0) {
            // Calculate estimated amount out for the swap back
            uint256 estimatedSwapBackAmountOut = _curveRouter.get_dy(
                _reverseRoute,
                _reverseSwapParams,
                redundantAmount
            );

            // Calculate minimum output amount using maxSlippageSurplusSwapBps
            uint256 minSwapBackAmountOut = (estimatedSwapBackAmountOut *
                (Constants.ONE_HUNDRED_PERCENT_BPS - maxSlippageSurplusSwapBps)) / Constants.ONE_HUNDRED_PERCENT_BPS;

            address outputToken = getLastTokenInRoute(_route);

            ERC20(outputToken).approve(address(_curveRouter), redundantAmount);
            _curveRouter.exchange(
                _reverseRoute,
                _reverseSwapParams,
                redundantAmount,
                minSwapBackAmountOut,
                address(this)
            );
        }

        // Input token balance after the swap
        uint256 inputTokenBalanceAfter = ERC20(inputToken).balanceOf(address(this));

        if (inputTokenBalanceAfter < inputTokenBalanceBefore) {
            uint256 usedInputAmount = inputTokenBalanceBefore - inputTokenBalanceAfter;

            return usedInputAmount;
        } else {
            return 0;
        }
    }
}
