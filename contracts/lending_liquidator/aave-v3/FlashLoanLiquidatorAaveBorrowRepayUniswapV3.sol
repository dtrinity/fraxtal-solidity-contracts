// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.20;

import "../../dex/periphery/interfaces/ISwapRouter.sol";
import "./FlashLoanLiquidatorAaveBorrowRepayBase.sol";

contract FlashLoanLiquidatorAaveBorrowRepayUniswapV3 is FlashLoanLiquidatorAaveBorrowRepayBase {
    using SafeTransferLib for ERC20;

    ISwapRouter public immutable uniswapV3Router;

    constructor(
        ILendingPool _flashLoanLender,
        ILendingPoolAddressesProvider _addressesProvider,
        ILendingPool _liquidateLender,
        uint256 _slippageTolerance,
        ISwapRouter _uniswapV3Router
    )
        FlashLoanLiquidatorAaveBorrowRepayBase(
            _flashLoanLender,
            _addressesProvider,
            _liquidateLender,
            _slippageTolerance
        )
    {
        uniswapV3Router = _uniswapV3Router;
    }

    /// @inheritdoc FlashLoanLiquidatorAaveBorrowRepayBase
    function _swapExactOutput(
        address _inputToken,
        address, // _outputToken is not used in this context
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
