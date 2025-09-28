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
import { ICurveRouterNgPoolsOnlyV1 } from "contracts/curve/interfaces/ICurveRouterNgPoolsOnlyV1.sol";
import { ICurveRouterWrapper } from "contracts/curve/interfaces/ICurveRouterWrapper.sol";
import { CurveHelper } from "contracts/curve/CurveHelper.sol";
import { Strings } from "@openzeppelin/contracts-5/utils/Strings.sol";

/**
 * @title CurveSwapLogic
 * @dev Library for common Curve-related functions used in dLOOP contracts
 */
library CurveSwapLogic {
    using SafeERC20 for ERC20;

    /**
     * @dev Error thrown when custom swap data is provided but not supported
     */
    error NotSupportedCustomSwapData(address _inputToken, address _outputToken, bytes _swapData);

    /**
     * @dev Configuration structure for Curve swap parameters and their reversals
     */
    struct CurveSwapExtraParamsDefaultConfig {
        address inputToken;
        address outputToken;
        CurveHelper.CurveSwapExtraParams swapExtraParams;
        CurveHelper.CurveSwapExtraParams reverseSwapExtraParams;
    }

    /**
     * @dev Swaps an exact amount of output tokens for input tokens using Curve protocol
     * @param inputToken Input token to be swapped
     * @param outputToken Output token to receive
     * @param amountOut Exact amount of output tokens to receive
     * @param amountInMaximum Maximum amount of input tokens to spend
     * @param maxSlippageSurplusSwapBps Maximum slippage surplus swap
     * @param receiver Address to receive the output tokens
     * @param extraData Additional data for the swap (not supported)
     * @param curveRouter Curve router to use for the swap
     * @param defaultSwapParams Mapping of default swap parameters
     * @param isSwapParamsSet Mapping indicating if swap parameters are set
     * @return uint256 Amount of input tokens used
     */
    function swapExactOutput(
        ERC20 inputToken,
        ERC20 outputToken,
        uint256 amountOut,
        uint256 amountInMaximum,
        uint256 maxSlippageSurplusSwapBps,
        address receiver,
        bytes memory extraData,
        ICurveRouterNgPoolsOnlyV1 curveRouter,
        mapping(string => CurveHelper.CurveSwapExtraParams) storage defaultSwapParams,
        mapping(string => bool) storage isSwapParamsSet
    ) external returns (uint256) {
        // If custom swap data is provided, revert as it's not supported
        if (extraData.length != 0) {
            revert NotSupportedCustomSwapData(address(inputToken), address(outputToken), extraData);
        }

        // Get the swap parameters for the given input and output tokens
        CurveHelper.CurveSwapExtraParams memory extraParams = getSwapExtraParams(
            address(inputToken),
            address(outputToken),
            defaultSwapParams,
            isSwapParamsSet
        );

        CurveHelper.CurveSwapExtraParams memory reverseExtraParams = getSwapExtraParams(
            address(outputToken),
            address(inputToken),
            defaultSwapParams,
            isSwapParamsSet
        );

        // Double check input token is the first token in the route
        if (address(inputToken) != extraParams.route[0]) {
            revert ICurveRouterWrapper.InvalidInputTokenInRoute(address(inputToken), extraParams.route);
        }

        // Approve the router to spend our tokens
        inputToken.approve(address(curveRouter), amountInMaximum);

        // Execute the swap using the CurveHelper library
        uint256 amountIn = CurveHelper.swapExactOutput(
            curveRouter,
            extraParams.route,
            extraParams.swapParams,
            reverseExtraParams.route,
            reverseExtraParams.swapParams,
            extraParams.swapSlippageBufferBps,
            maxSlippageSurplusSwapBps,
            amountOut,
            amountInMaximum
        );

        // If recipient is different from the caller, transfer the output tokens
        if (receiver != address(this)) {
            address lastToken = CurveHelper.getLastTokenInRoute(extraParams.route);
            ERC20(lastToken).safeTransfer(receiver, amountOut);
        }

        return amountIn;
    }

    /**
     * @dev Initialize default swap parameters for a list of token pairs
     * @param defaultSwapParamsList List of default swap parameters
     * @param defaultSwapParams Mapping to store default swap parameters
     * @param isSwapParamsSet Mapping to track which parameters are set
     */
    function initializeDefaultSwapParams(
        CurveSwapExtraParamsDefaultConfig[] memory defaultSwapParamsList,
        mapping(string => CurveHelper.CurveSwapExtraParams) storage defaultSwapParams,
        mapping(string => bool) storage isSwapParamsSet
    ) external {
        for (uint256 i = 0; i < defaultSwapParamsList.length; i++) {
            // Set for forward swap
            string memory key = getSwapExtraParamsKey(
                defaultSwapParamsList[i].inputToken,
                defaultSwapParamsList[i].outputToken
            );
            if (isSwapParamsSet[key]) {
                revert ICurveRouterWrapper.DuplicateKeyForSwapExtraParams(
                    defaultSwapParamsList[i].inputToken,
                    defaultSwapParamsList[i].outputToken,
                    key
                );
            }
            isSwapParamsSet[key] = true;
            defaultSwapParams[key] = defaultSwapParamsList[i].swapExtraParams;

            // Set for reverse swap
            string memory reverseKey = getSwapExtraParamsKey(
                defaultSwapParamsList[i].outputToken,
                defaultSwapParamsList[i].inputToken
            );
            if (isSwapParamsSet[reverseKey]) {
                revert ICurveRouterWrapper.DuplicateKeyForSwapExtraParams(
                    defaultSwapParamsList[i].outputToken,
                    defaultSwapParamsList[i].inputToken,
                    reverseKey
                );
            }
            isSwapParamsSet[reverseKey] = true;
            defaultSwapParams[reverseKey] = defaultSwapParamsList[i].reverseSwapExtraParams;
        }
    }

    /**
     * @dev Sets swap parameters for a token pair
     * @param swapExtraParamsConfig Configuration for the swap parameters
     * @param defaultSwapParams Mapping to store swap parameters
     * @param isSwapParamsSet Mapping to track which parameters are set
     */
    function setSwapExtraParams(
        CurveSwapExtraParamsDefaultConfig memory swapExtraParamsConfig,
        mapping(string => CurveHelper.CurveSwapExtraParams) storage defaultSwapParams,
        mapping(string => bool) storage isSwapParamsSet
    ) external {
        string memory key = getSwapExtraParamsKey(swapExtraParamsConfig.inputToken, swapExtraParamsConfig.outputToken);
        isSwapParamsSet[key] = true;
        defaultSwapParams[key] = swapExtraParamsConfig.swapExtraParams;

        string memory reverseKey = getSwapExtraParamsKey(
            swapExtraParamsConfig.outputToken,
            swapExtraParamsConfig.inputToken
        );
        isSwapParamsSet[reverseKey] = true;
        defaultSwapParams[reverseKey] = swapExtraParamsConfig.reverseSwapExtraParams;
    }

    /**
     * @dev Gets the key for swap parameters based on input and output tokens
     * @param inputToken Address of the input token
     * @param outputToken Address of the output token
     * @return string The key for the swap parameters
     */
    function getSwapExtraParamsKey(address inputToken, address outputToken) public pure returns (string memory) {
        string memory key = string.concat(
            Strings.toHexString(uint160(inputToken), 20),
            "-",
            Strings.toHexString(uint160(outputToken), 20)
        );
        return key;
    }

    /**
     * @dev Gets the swap parameters for a token pair
     * @param inputToken Address of the input token
     * @param outputToken Address of the output token
     * @param defaultSwapParams Mapping of default swap parameters
     * @param isSwapParamsSet Mapping indicating if swap parameters are set
     * @return CurveHelper.CurveSwapExtraParams The swap parameters
     */
    function getSwapExtraParams(
        address inputToken,
        address outputToken,
        mapping(string => CurveHelper.CurveSwapExtraParams) storage defaultSwapParams,
        mapping(string => bool) storage isSwapParamsSet
    ) public view returns (CurveHelper.CurveSwapExtraParams memory) {
        string memory key = getSwapExtraParamsKey(inputToken, outputToken);
        // If the key is not found, revert
        if (!isSwapParamsSet[key]) {
            revert ICurveRouterWrapper.NotFoundKeyForSwapExtraParams(inputToken, outputToken, key);
        }
        return defaultSwapParams[key];
    }
}
