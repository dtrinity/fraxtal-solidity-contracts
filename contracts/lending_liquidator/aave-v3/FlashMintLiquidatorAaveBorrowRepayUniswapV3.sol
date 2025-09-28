// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.20;

import "../../dex/periphery/interfaces/ISwapRouter.sol";
import "./FlashMintLiquidatorAaveBorrowRepayBase.sol";

contract FlashMintLiquidatorAaveBorrowRepayUniswapV3 is FlashMintLiquidatorAaveBorrowRepayBase {
    using SafeTransferLib for ERC20;

    ISwapRouter public immutable uniswapV3Router;

    constructor(
        IERC3156FlashLender _flashMinter,
        ILendingPoolAddressesProvider _addressesProvider,
        ILendingPool _liquidateLender,
        IAToken _aDUSD,
        uint256 _slippageTolerance,
        ISwapRouter _uniswapV3Router
    )
        FlashMintLiquidatorAaveBorrowRepayBase(
            _flashMinter,
            _addressesProvider,
            _liquidateLender,
            _aDUSD,
            _slippageTolerance
        )
    {
        uniswapV3Router = _uniswapV3Router;
    }

    /// @inheritdoc FlashMintLiquidatorAaveBorrowRepayBase
    function _swapExactOutput(
        address _inputToken,
        address, // _outputToken
        bytes memory _swapData,
        uint256 _amount,
        uint256 _maxIn
    ) internal override returns (uint256 amountIn) {
        ERC20(_inputToken).safeApprove(address(uniswapV3Router), _maxIn);
        amountIn = uniswapV3Router.exactOutput(
            ISwapRouter.ExactOutputParams(_swapData, address(this), block.timestamp, _amount, _maxIn)
        );
    }
}
