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

import "../interface/IWETH.sol";
import "../interface/aave-v3/aave/ILendingPoolAddressesProvider.sol";
import "../interface/aave-v3/aave/IPriceOracleGetter.sol";
import "../../lending/core/interfaces/IAToken.sol";
import "../interface/aave-v3/ILiquidator.sol";
import "../interface/aave-v3/libraries/aave/ReserveConfiguration.sol";
import "contracts/lending/core/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";

import "../libraries/PercentageMath.sol";

import "../interface/aave-v3/aave/ILendingPool.sol";

import "@openzeppelin/contracts-4-6/security/ReentrancyGuard.sol";
import "../common/SharedLiquidator.sol";

abstract contract FlashLoanLiquidatorBaseAave is
    ReentrancyGuard,
    SharedLiquidator,
    IFlashLoanSimpleReceiver
{
    using SafeTransferLib for ERC20;
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;
    using PercentageMath for uint256;

    struct FlashLoanParams {
        address collateralUnderlying;
        address borrowedUnderlying;
        address poolTokenCollateral;
        address poolTokenBorrowed;
        address liquidator;
        address borrower;
        uint256 toLiquidate;
        bytes path;
    }

    struct LiquidateParams {
        ERC20 collateralUnderlying;
        ERC20 borrowedUnderlying;
        IAToken poolTokenCollateral;
        IAToken poolTokenBorrowed;
        address liquidator;
        address borrower;
        uint256 toRepay;
    }

    error ValueAboveBasisPoints();

    error UnknownLender();

    error UnknownInitiator();

    error NoProfitableLiquidation();

    error InvalidFlashLoanAmount(uint256 flashLoanAmount, uint256 toLiquidate);

    error InsufficientFlashLoanRepayAmount(
        uint256 balance,
        uint256 totalToRepay
    );

    event Liquidated(
        address indexed liquidator,
        address borrower,
        address indexed poolTokenBorrowedAddress,
        address indexed poolTokenCollateralAddress,
        uint256 amount,
        uint256 seized,
        bool usingFlashLoan
    );

    event FlashLoan(address indexed initiator, uint256 amount);

    uint256 public constant ONE_HUNDER_PCT_BPS = 10_000; // 100% in basis points
    uint256 public slippageTolerance; // in basis points units

    ILendingPool public immutable flashLoanLender;
    ILendingPool public immutable liquidateLender;
    ILendingPoolAddressesProvider public immutable addressesProvider;

    constructor(
        ILendingPool _flashLoanLender,
        ILendingPool _liquidateLender,
        ILendingPoolAddressesProvider _addressesProvider
    ) SharedLiquidator() {
        flashLoanLender = _flashLoanLender;
        liquidateLender = _liquidateLender;
        addressesProvider = _addressesProvider;
    }

    function _liquidateInternal(
        LiquidateParams memory _liquidateParams
    ) internal returns (uint256 seized_) {
        uint256 balanceBefore = _liquidateParams.collateralUnderlying.balanceOf(
            address(this)
        );
        _liquidateParams.borrowedUnderlying.safeApprove(
            address(liquidateLender),
            _liquidateParams.toRepay
        );
        liquidateLender.liquidationCall(
            address(
                _getUnderlying(address(_liquidateParams.poolTokenCollateral))
            ),
            address(
                _getUnderlying(address(_liquidateParams.poolTokenBorrowed))
            ),
            _liquidateParams.borrower,
            _liquidateParams.toRepay,
            false
        );
        seized_ =
            _liquidateParams.collateralUnderlying.balanceOf(address(this)) -
            balanceBefore;
        emit Liquidated(
            msg.sender,
            _liquidateParams.borrower,
            address(_liquidateParams.poolTokenBorrowed),
            address(_liquidateParams.poolTokenCollateral),
            _liquidateParams.toRepay,
            seized_,
            false
        );
    }

    function _liquidateWithFlashLoan(
        FlashLoanParams memory _flashLoanParams
    ) internal returns (uint256 seized_) {
        bytes memory data = _encodeData(_flashLoanParams);

        uint256 borrowedTokenToFlashLoan = _flashLoanParams.toLiquidate;
        uint256 balanceBefore = ERC20(_flashLoanParams.collateralUnderlying)
            .balanceOf(address(this));

        // The liquidation is done in the callback at executeOperation()
        // - contracts/lending_liquidator/aave-v3/FlashLoanLiquidatorBorrowRepayAave.sol
        // - The flashLoanSimple() of the minter will call the executeOperation() function of the receiver (FlashLoanSimpleReceiver)
        flashLoanLender.flashLoanSimple(
            address(this),
            _flashLoanParams.borrowedUnderlying,
            borrowedTokenToFlashLoan,
            data,
            0
        );

        uint256 balanceAfter = ERC20(_flashLoanParams.collateralUnderlying)
            .balanceOf(address(this));

        if (balanceAfter > balanceBefore) {
            seized_ = balanceAfter - balanceBefore;
        } else {
            // As there is no profit, the seized amount is 0
            seized_ = 0;
        }

        emit FlashLoan(msg.sender, borrowedTokenToFlashLoan);
    }

    function _encodeData(
        FlashLoanParams memory _flashLoanParams
    ) internal pure returns (bytes memory data) {
        data = abi.encode(
            _flashLoanParams.collateralUnderlying,
            _flashLoanParams.borrowedUnderlying,
            _flashLoanParams.poolTokenCollateral,
            _flashLoanParams.poolTokenBorrowed,
            _flashLoanParams.liquidator,
            _flashLoanParams.borrower,
            _flashLoanParams.toLiquidate,
            _flashLoanParams.path
        );
    }

    function _decodeData(
        bytes calldata data
    ) internal pure returns (FlashLoanParams memory _flashLoanParams) {
        // Need to split the decode because of stack too deep error
        (
            _flashLoanParams.collateralUnderlying,
            _flashLoanParams.borrowedUnderlying,
            _flashLoanParams.poolTokenCollateral,
            _flashLoanParams.poolTokenBorrowed,
            ,
            ,
            ,

        ) = abi.decode(
            data,
            (
                address,
                address,
                address,
                address,
                address,
                address,
                uint256,
                bytes
            )
        );
        (
            ,
            ,
            ,
            ,
            _flashLoanParams.liquidator,
            _flashLoanParams.borrower,
            _flashLoanParams.toLiquidate,
            _flashLoanParams.path
        ) = abi.decode(
            data,
            (
                address,
                address,
                address,
                address,
                address,
                address,
                uint256,
                bytes
            )
        );
    }

    function _getUnderlying(
        address _poolToken
    ) internal view returns (ERC20 underlying_) {
        underlying_ = ERC20(IAToken(_poolToken).UNDERLYING_ASSET_ADDRESS());
    }
}
