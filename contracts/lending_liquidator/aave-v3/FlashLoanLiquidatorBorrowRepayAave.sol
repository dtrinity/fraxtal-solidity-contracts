// SPDX-License-Identifier: GNU AGPLv3
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

import "../../dex/periphery/interfaces/ISwapRouter.sol";
import "./FlashLoanLiquidatorBaseAave.sol";

contract FlashLoanLiquidatorBorrowRepayAave is FlashLoanLiquidatorBaseAave {
    using SafeTransferLib for ERC20;
    using PercentageMath for uint256;

    event SlippageToleranceSet(uint256 newTolerance);

    ISwapRouter public immutable uniswapV3Router;

    constructor(
        ILendingPool _flashLoanLender,
        ISwapRouter _uniswapV3Router,
        ILendingPoolAddressesProvider _addressesProvider,
        ILendingPool _liquidateLender,
        uint256 _slippageTolerance
    )
        FlashLoanLiquidatorBaseAave(
            _flashLoanLender,
            _liquidateLender,
            _addressesProvider
        )
    {
        uniswapV3Router = _uniswapV3Router;
        slippageTolerance = _slippageTolerance;
        emit SlippageToleranceSet(_slippageTolerance);
    }

    function setSlippageTolerance(uint256 _newTolerance) external onlyOwner {
        if (_newTolerance > ONE_HUNDER_PCT_BPS) revert ValueAboveBasisPoints();
        slippageTolerance = _newTolerance;
        emit SlippageToleranceSet(_newTolerance);
    }

    function liquidate(
        address _poolTokenBorrowedAddress,
        address _poolTokenCollateralAddress,
        address _borrower,
        uint256 _repayAmount,
        bool _stakeTokens,
        bytes memory _path
    ) external nonReentrant onlyLiquidator {
        LiquidateParams memory liquidateParams = LiquidateParams(
            _getUnderlying(_poolTokenCollateralAddress),
            _getUnderlying(_poolTokenBorrowedAddress),
            IAToken(_poolTokenCollateralAddress),
            IAToken(_poolTokenBorrowedAddress),
            msg.sender,
            _borrower,
            _repayAmount
        );

        uint256 seized;
        if (
            liquidateParams.borrowedUnderlying.balanceOf(address(this)) >=
            _repayAmount
        )
            // we can liquidate without flash loan by using the contract balance
            seized = _liquidateInternal(liquidateParams);
        else {
            FlashLoanParams memory params = FlashLoanParams(
                address(liquidateParams.collateralUnderlying),
                address(liquidateParams.borrowedUnderlying),
                address(liquidateParams.poolTokenCollateral),
                address(liquidateParams.poolTokenBorrowed),
                liquidateParams.liquidator,
                liquidateParams.borrower,
                liquidateParams.toRepay,
                _path
            );
            seized = _liquidateWithFlashLoan(params);
        }

        if (!_stakeTokens)
            liquidateParams.collateralUnderlying.safeTransfer(
                msg.sender,
                seized
            );
    }

    /// @dev IFlashLoanSimpleReceiver callback
    function executeOperation(
        address, // asset to flash loan
        uint256 flashLoanAmount, // amount to flash loan
        uint256 premium, // fee to pay
        address _initiator, // initiator of the flash loan
        bytes calldata params
    ) external override returns (bool) {
        if (msg.sender != address(flashLoanLender)) revert UnknownLender();
        if (_initiator != address(this)) revert UnknownInitiator();
        FlashLoanParams memory flashLoanParams = _decodeData(params);
        if (flashLoanAmount != flashLoanParams.toLiquidate) {
            revert InvalidFlashLoanAmount(
                flashLoanAmount,
                flashLoanParams.toLiquidate
            );
        }

        _flashLoanInternal(flashLoanParams, premium);
        return true;
    }

    /// @dev IFlashLoanReceiver required function
    function ADDRESSES_PROVIDER()
        external
        view
        override
        returns (IPoolAddressesProvider)
    {
        return addressesProvider;
    }

    /// @dev IFlashLoanReceiver required function
    function POOL() external view override returns (IPool) {
        return flashLoanLender;
    }

    function _flashLoanInternal(
        FlashLoanParams memory _flashLoanParams,
        uint256 _premium
    ) internal {
        LiquidateParams memory liquidateParams = LiquidateParams(
            ERC20(_flashLoanParams.collateralUnderlying),
            ERC20(_flashLoanParams.borrowedUnderlying),
            IAToken(_flashLoanParams.poolTokenCollateral),
            IAToken(_flashLoanParams.poolTokenBorrowed),
            _flashLoanParams.liquidator,
            _flashLoanParams.borrower,
            _flashLoanParams.toLiquidate
        );
        uint256 seized = _liquidateInternal(liquidateParams);

        if (
            _flashLoanParams.borrowedUnderlying !=
            _flashLoanParams.collateralUnderlying
        ) {
            // need a swap
            // we use aave oracle
            IPriceOracleGetter oracle = IPriceOracleGetter(
                addressesProvider.getPriceOracle()
            );
            uint256 maxIn = (((_flashLoanParams.toLiquidate *
                10 ** liquidateParams.collateralUnderlying.decimals() *
                oracle.getAssetPrice(_flashLoanParams.borrowedUnderlying)) /
                oracle.getAssetPrice(_flashLoanParams.collateralUnderlying) /
                10 ** liquidateParams.borrowedUnderlying.decimals()) *
                (ONE_HUNDER_PCT_BPS + slippageTolerance)) / ONE_HUNDER_PCT_BPS;

            ERC20(_flashLoanParams.collateralUnderlying).safeApprove(
                address(uniswapV3Router),
                maxIn
            );

            _doSecondSwap(
                _flashLoanParams.path,
                _flashLoanParams.toLiquidate + _premium,
                maxIn
            );

            uint256 borrowedUnderlyingBalanceAfter = ERC20(
                _flashLoanParams.borrowedUnderlying
            ).balanceOf(address(this));

            // Make sure we have enough to repay the flash loan
            if (
                borrowedUnderlyingBalanceAfter <
                _flashLoanParams.toLiquidate + _premium
            ) {
                revert InsufficientFlashLoanRepayAmount(
                    borrowedUnderlyingBalanceAfter,
                    _flashLoanParams.toLiquidate + _premium
                );
            }
        }
        ERC20(_flashLoanParams.borrowedUnderlying).safeApprove(
            address(flashLoanLender),
            _flashLoanParams.toLiquidate + _premium
        );

        emit Liquidated(
            _flashLoanParams.liquidator,
            _flashLoanParams.borrower,
            _flashLoanParams.poolTokenBorrowed,
            _flashLoanParams.poolTokenCollateral,
            _flashLoanParams.toLiquidate,
            seized,
            true
        );
    }

    function _doSecondSwap(
        bytes memory _path,
        uint256 _amount,
        uint256 _maxIn
    ) internal returns (uint256 amountIn) {
        amountIn = uniswapV3Router.exactOutput(
            ISwapRouter.ExactOutputParams(
                _path,
                address(this),
                block.timestamp,
                _amount,
                _maxIn
            )
        );
    }
}
