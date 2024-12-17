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
import {ISwapRouter} from "../dex/periphery/interfaces/ISwapRouter.sol";

/**
 * @title DLoopVaultUniswapV3
 * @dev A leveraged vault contract with Uniswap V3 swap-specific logic
 */
contract DLoopVaultUniswapV3 is DLoopVaultBase {
    bytes public DEFAULT_DUSD_TO_UNDERLYING_SWAP_PATH;
    bytes public DEFAULT_UNDERLYING_TO_DUSD_SWAP_PATH;

    error InvalidInputOutputTokens(address inputToken, address outputToken);

    ISwapRouter public immutable swapRouter;

    /**
     * @dev Constructor for the DLoopVaultUniswapV3 contract
     * @param _name Name of the vault token
     * @param _symbol Symbol of the vault token
     * @param _underlyingAsset Address of the underlying asset
     * @param _dusd Address of the dUSD token
     * @param _flashLender Address of the flash loan provider
     * @param _swapRouter Address of the swap router
     * @param _defaultDUSDToUnderlyingSwapPath Default swap path from dUSD to underlying asset
     * @param _defaultUnderlyingToDUSDSwapPath Default swap path from underlying asset to dUSD
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
        ISwapRouter _swapRouter,
        bytes memory _defaultDUSDToUnderlyingSwapPath,
        bytes memory _defaultUnderlyingToDUSDSwapPath,
        IPoolAddressesProvider _lendingPoolAddressesProvider,
        uint32 _targetLeverageBps,
        uint256 _swapSlippageTolerance,
        uint256 _maxSubsidyBps
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
        swapRouter = _swapRouter;
        DEFAULT_DUSD_TO_UNDERLYING_SWAP_PATH = _defaultDUSDToUnderlyingSwapPath;
        DEFAULT_UNDERLYING_TO_DUSD_SWAP_PATH = _defaultUnderlyingToDUSDSwapPath;
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
        bytes memory extraData // swap path
    ) internal override returns (uint256) {
        if (extraData.length == 0) {
            return
                _swapExactOutputImplementation(
                    inputToken,
                    dusd,
                    amountOut,
                    amountInMaximum,
                    to,
                    deadline,
                    _getDefaultSwapPath(
                        address(inputToken),
                        address(outputToken)
                    )
                );
        } else {
            return
                _swapExactOutputImplementation(
                    inputToken,
                    dusd,
                    amountOut,
                    amountInMaximum,
                    to,
                    deadline,
                    extraData
                );
        }
    }

    function _getDefaultSwapPath(
        address inputToken,
        address outputToken
    ) internal view returns (bytes memory) {
        if (
            inputToken == address(dusd) &&
            outputToken == address(underlyingAsset)
        ) {
            return DEFAULT_DUSD_TO_UNDERLYING_SWAP_PATH;
        } else if (
            inputToken == address(underlyingAsset) &&
            outputToken == address(dusd)
        ) {
            return DEFAULT_UNDERLYING_TO_DUSD_SWAP_PATH;
        }

        revert InvalidInputOutputTokens(inputToken, outputToken);
    }

    function _swapExactOutputImplementation(
        ERC20 inputToken,
        ERC20, // outputToken
        uint256 amountOut,
        uint256 amountInMaximum,
        address to,
        uint256 deadline,
        bytes memory swapPath
    ) internal returns (uint256) {
        // Approve the swap router to spend the input token
        require(
            inputToken.approve(address(swapRouter), amountInMaximum),
            "approve failed for swap router in deposit"
        );

        // Swap from the input token to the output token
        uint256 inputTokenUsedInSwap = swapRouter.exactOutput(
            ISwapRouter.ExactOutputParams(
                swapPath,
                to,
                deadline,
                amountOut,
                amountInMaximum
            )
        );

        return inputTokenUsedInSwap;
    }

    /* DEX utilities */

    function _getSwapRouterAddress() internal view returns (address) {
        return address(swapRouter);
    }
}
