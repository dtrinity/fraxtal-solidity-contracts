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
import "./FlashMintLiquidatorBaseAave.sol";

contract FlashMintLiquidatorBorrowRepayAave is FlashMintLiquidatorBaseAave {
    using SafeTransferLib for ERC20;
    using PercentageMath for uint256;

    event SlippageToleranceSet(uint256 newTolerance);

    error NotSupportingNonDUSD(address borrowedToken, string symbol);

    ISwapRouter public immutable uniswapV3Router;

    constructor(
        IERC3156FlashLender _flashMinter,
        ISwapRouter _uniswapV3Router,
        ILendingPoolAddressesProvider _addressesProvider,
        ILendingPool _liquidateLender,
        IAToken _aDUSD,
        uint256 _slippageTolerance
    )
        FlashMintLiquidatorBaseAave(
            _flashMinter,
            _liquidateLender,
            _addressesProvider,
            _aDUSD
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

    /// @dev ERC-3156 Flash loan callback
    function onFlashLoan(
        address _initiator,
        address,
        uint256, // flashloan amount
        uint256,
        bytes calldata data
    ) external override returns (bytes32) {
        if (msg.sender != address(flashMinter)) revert UnknownLender();
        if (_initiator != address(this)) revert UnknownInitiator();
        FlashLoanParams memory flashLoanParams = _decodeData(data);

        _flashLoanInternal(flashLoanParams);
        return FLASHLOAN_CALLBACK;
    }

    function _flashLoanInternal(
        FlashLoanParams memory _flashLoanParams
    ) internal {
        if (_flashLoanParams.borrowedUnderlying != address(dusd)) {
            revert NotSupportingNonDUSD(
                _flashLoanParams.borrowedUnderlying,
                ERC20(_flashLoanParams.borrowedUnderlying).symbol()
            );
        }

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
                _flashLoanParams.toLiquidate,
                maxIn
            );
        }
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
