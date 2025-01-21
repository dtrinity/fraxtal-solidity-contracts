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

import {DLoopVaultBase, ERC20, IERC3156FlashLender, IPoolAddressesProvider} from "./DLoopVaultBase.sol";
import {ICurveRouterNgPoolsOnlyV1} from "contracts/curve/interfaces/ICurveRouterNgPoolsOnlyV1.sol";
import {ICurveRouterWrapper} from "contracts/curve/interfaces/ICurveRouterWrapper.sol";
import {Constants} from "contracts/shared/Constants.sol";

/**
 * @title DLoopVaultCurve
 * @dev A leveraged vault contract with CurveFi swap-specific logic
 */
contract DLoopVaultCurve is DLoopVaultBase {
    struct CurveSwapExtraParams {
        address[11] route;
        uint256[4][5] swapParams;
        uint256 swapSlippageBufferBps;
    }
    struct ExtraParams {
        bytes swapExtraParams;
        bytes reversedSwapExtraParams;
    }

    ICurveRouterNgPoolsOnlyV1 public immutable curveRouter;

    CurveSwapExtraParams public DEFAULT_DUSD_TO_UNDERLYING_SWAP_EXTRA_PARAMS;
    CurveSwapExtraParams public DEFAULT_UNDERLYING_TO_DUSD_SWAP_EXTRA_PARAMS;
    uint256 private _defaultMaxSlippageSurplusSwapBps;

    error InvalidInputOutputTokens(address inputToken, address outputToken);

    /**
     * @dev Constructor for the DLoopVaultCurve contract
     * @param _name Name of the vault token
     * @param _symbol Symbol of the vault token
     * @param _underlyingAsset Address of the underlying asset
     * @param _dusd Address of the dUSD token
     * @param _flashLender Address of the flash loan provider
     * @param _curveRouter Address of the Curve router
     * @param _defaultDUSDToUnderlyingSwapExtraParams Default swap params from dUSD to underlying asset
     * @param _defaultUnderlyingToDUSDSwapExtraParams Default swap params from underlying asset to dUSD
     * @param _lendingPoolAddressesProvider Address of the lending pool addresses provider
     * @param _targetLeverageBps Target leverage in basis points
     * @param _swapSlippageTolerance Swap slippage tolerance in basis points
     * @param _maxSubsidyBps Maximum subsidy in basis points
     */
    constructor(
        string memory _name,
        string memory _symbol,
        ERC20 _underlyingAsset,
        ERC20 _dusd,
        IERC3156FlashLender _flashLender,
        ICurveRouterNgPoolsOnlyV1 _curveRouter,
        CurveSwapExtraParams memory _defaultDUSDToUnderlyingSwapExtraParams,
        CurveSwapExtraParams memory _defaultUnderlyingToDUSDSwapExtraParams,
        IPoolAddressesProvider _lendingPoolAddressesProvider,
        uint32 _targetLeverageBps,
        uint256 _swapSlippageTolerance,
        uint256 _maxSubsidyBps,
        uint256 _maxSlippageSurplusSwapBps
    )
        DLoopVaultBase(
            _name,
            _symbol,
            _underlyingAsset,
            _dusd,
            _flashLender,
            _lendingPoolAddressesProvider,
            _targetLeverageBps,
            _swapSlippageTolerance,
            _maxSubsidyBps
        )
    {
        curveRouter = ICurveRouterNgPoolsOnlyV1(_curveRouter);
        _defaultMaxSlippageSurplusSwapBps = _maxSlippageSurplusSwapBps;
        DEFAULT_DUSD_TO_UNDERLYING_SWAP_EXTRA_PARAMS = _defaultDUSDToUnderlyingSwapExtraParams;
        DEFAULT_UNDERLYING_TO_DUSD_SWAP_EXTRA_PARAMS = _defaultUnderlyingToDUSDSwapExtraParams;
    }

    /**
     * @inheritdoc DLoopVaultBase
     */
    function _swapExactOutput(
        ERC20 inputToken,
        ERC20 outputToken,
        uint256 amountOut,
        uint256 amountInMaximum,
        address to,
        uint256 deadline,
        bytes memory extraData
    ) internal override returns (uint256) {
        if (extraData.length == 0) {
            return
                _swapExactOutputImplementation(
                    inputToken,
                    outputToken,
                    amountOut,
                    amountInMaximum,
                    to,
                    deadline,
                    _getDefaultSwapExtraParams(
                        address(inputToken),
                        address(outputToken)
                    ),
                    _getDefaultSwapExtraParams(
                        address(outputToken),
                        address(inputToken)
                    )
                );
        } else {
            ExtraParams memory _extraParams = _decodeExtraParams(extraData);
            return
                _swapExactOutputImplementation(
                    inputToken,
                    outputToken,
                    amountOut,
                    amountInMaximum,
                    to,
                    deadline,
                    _decodeCurveSwapExtraParams(_extraParams.swapExtraParams),
                    _decodeCurveSwapExtraParams(
                        _extraParams.reversedSwapExtraParams
                    )
                );
        }
    }

    function _getDefaultSwapExtraParams(
        address inputToken,
        address outputToken
    ) internal view returns (CurveSwapExtraParams memory) {
        if (
            inputToken == address(dusd) &&
            outputToken == address(underlyingAsset)
        ) {
            return DEFAULT_DUSD_TO_UNDERLYING_SWAP_EXTRA_PARAMS;
        } else if (
            inputToken == address(underlyingAsset) &&
            outputToken == address(dusd)
        ) {
            return DEFAULT_UNDERLYING_TO_DUSD_SWAP_EXTRA_PARAMS;
        }

        revert InvalidInputOutputTokens(inputToken, outputToken);
    }

    function _decodeExtraParams(
        bytes memory data
    ) internal pure returns (ExtraParams memory _extraParams) {
        (
            _extraParams.swapExtraParams,
            _extraParams.reversedSwapExtraParams
        ) = abi.decode(data, (bytes, bytes));
    }

    function _decodeCurveSwapExtraParams(
        bytes memory data
    ) internal pure returns (CurveSwapExtraParams memory _swapExtraParams) {
        (
            _swapExtraParams.route,
            _swapExtraParams.swapParams,
            _swapExtraParams.swapSlippageBufferBps
        ) = abi.decode(data, (address[11], uint256[4][5], uint256));
    }

    function _swapExactOutputImplementation(
        ERC20 inputToken,
        ERC20 outputToken,
        uint256 amountOut,
        uint256 amountInMaximum,
        address to,
        uint256, // deadline, not used in Curve
        CurveSwapExtraParams memory extraParams,
        CurveSwapExtraParams memory reversedExtraParams
    ) internal returns (uint256) {
        // Calculate the required input amount
        uint256 estimatedAmountIn = curveRouter.get_dx(
            extraParams.route,
            extraParams.swapParams,
            amountOut
        );

        // Add a buffer to account for potential slippage
        uint256 amountIn = (estimatedAmountIn *
            (Constants.ONE_HUNDRED_PERCENT_BPS +
                extraParams.swapSlippageBufferBps)) /
            Constants.ONE_HUNDRED_PERCENT_BPS;

        if (amountIn > amountInMaximum) {
            revert ICurveRouterWrapper.InputAmountExceedsMaximum(
                amountIn,
                amountInMaximum
            );
        }

        // Input token balance before the swap
        uint256 inputTokenBalanceBefore = ERC20(inputToken).balanceOf(
            address(this)
        );

        // Approve the router to spend our tokens
        ERC20(inputToken).approve(address(curveRouter), amountInMaximum);

        // Execute the swap
        uint256 actualAmountOut = curveRouter.exchange(
            extraParams.route,
            extraParams.swapParams,
            amountIn,
            amountOut, // This is now our minimum expected output
            to
        );

        // Get the difference between the expected and actual output
        uint256 redundantAmount = actualAmountOut - amountOut;

        // Swap the redundantAmount back to the input token with the reverse route
        if (redundantAmount > 0) {
            // Calculate the minimum output amount using maxSlippageSurplusSwapBps
            // to avoid being exploited if using 0 minAmountOut
            uint256 estimatedSwapBackAmountOut = curveRouter.get_dy(
                reversedExtraParams.route,
                reversedExtraParams.swapParams,
                redundantAmount
            );
            uint256 minSwapBackAmountOut = (estimatedSwapBackAmountOut *
                (Constants.ONE_HUNDRED_PERCENT_BPS -
                    _defaultMaxSlippageSurplusSwapBps)) /
                Constants.ONE_HUNDRED_PERCENT_BPS;

            ERC20(outputToken).approve(address(curveRouter), redundantAmount);
            curveRouter.exchange(
                reversedExtraParams.route,
                reversedExtraParams.swapParams,
                redundantAmount,
                minSwapBackAmountOut, // TODO: need to fix this
                address(this)
            );
        }

        // Input token balance after the swap
        uint256 inputTokenBalanceAfter = ERC20(inputToken).balanceOf(
            address(this)
        );

        if (inputTokenBalanceAfter < inputTokenBalanceBefore) {
            uint256 usedInputAmount = inputTokenBalanceBefore -
                inputTokenBalanceAfter;

            return usedInputAmount;
        } else {
            return 0;
        }
    }

    /* View functions */

    function getDefaultMaxSlippageSurplusSwapBps()
        public
        view
        returns (uint256)
    {
        return _defaultMaxSlippageSurplusSwapBps;
    }

    /* Admin functions */

    function setDefaultMaxSlippageSurplusSwapBps(
        uint256 _maxSlippageSurplusSwapBps
    ) public onlyOwner {
        _defaultMaxSlippageSurplusSwapBps = _maxSlippageSurplusSwapBps;
    }
}
