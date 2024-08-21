// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.13;

import "../interface/IERC3156FlashLender.sol";
import "../interface/IERC3156FlashBorrower.sol";
import "../interface/IWETH.sol";
import "../interface/aave-v3/aave/ILendingPoolAddressesProvider.sol";
import "../interface/aave-v3/aave/IPriceOracleGetter.sol";
import "../../lending/core/interfaces/IAToken.sol";
import "../interface/aave-v3/ILiquidator.sol";
import "../interface/aave-v3/libraries/aave/ReserveConfiguration.sol";

import "../libraries/PercentageMath.sol";

import "../interface/aave-v3/aave/ILendingPool.sol";

import "@openzeppelin/contracts-4-6/security/ReentrancyGuard.sol";
import "../common/SharedLiquidator.sol";

abstract contract FlashMintLiquidatorBaseAave is
    ReentrancyGuard,
    SharedLiquidator,
    IERC3156FlashBorrower
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
    bytes32 public constant FLASHLOAN_CALLBACK =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    uint256 public immutable DUSD_DECIMALS;
    uint256 public slippageTolerance; // in basis points units

    IERC3156FlashLender public immutable flashMinter;
    ILendingPool public immutable liquidateLender;
    ILendingPoolAddressesProvider public immutable addressesProvider;
    IAToken public immutable aDUSD;
    ERC20 public immutable dusd;

    constructor(
        IERC3156FlashLender _flashMinter,
        ILendingPool _liquidateLender,
        ILendingPoolAddressesProvider _addressesProvider,
        IAToken _aDUSD
    ) SharedLiquidator() {
        flashMinter = _flashMinter;
        liquidateLender = _liquidateLender;
        addressesProvider = _addressesProvider;
        aDUSD = _aDUSD;
        dusd = ERC20(_aDUSD.UNDERLYING_ASSET_ADDRESS());
        DUSD_DECIMALS = dusd.decimals();
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

        uint256 dusdToFlashLoan = _getDUSDToFlashloan(
            _flashLoanParams.borrowedUnderlying,
            _flashLoanParams.toLiquidate
        );

        dusd.safeApprove(
            address(flashMinter),
            dusdToFlashLoan +
                flashMinter.flashFee(address(dusd), dusdToFlashLoan)
        );

        uint256 balanceBefore = ERC20(_flashLoanParams.collateralUnderlying)
            .balanceOf(address(this));

        // The liquidation is done in the callback at onFlashLoan()
        // - contracts/lending_liquidator/aave-v3/FlashMintLiquidatorBorrowRepayAave.sol
        // - The flashLoan() of the minter will call the onFlashLoan() function of the receiver (IERC3156FlashBorrower)
        flashMinter.flashLoan(this, address(dusd), dusdToFlashLoan, data);

        seized_ =
            ERC20(_flashLoanParams.collateralUnderlying).balanceOf(
                address(this)
            ) -
            balanceBefore;

        emit FlashLoan(msg.sender, dusdToFlashLoan);
    }

    function _getDUSDToFlashloan(
        address,
        uint256
    ) internal view returns (uint256 amountToFlashLoan_) {
        // As there is no fee for flash minting DUSD, we can flash mint the maximum amount
        // Maximum value of uint256
        amountToFlashLoan_ = flashMinter.maxFlashLoan(address(dusd));

        // This is the old way of calculating the amount to flash loan
        //
        // if (_underlyingToRepay == address(dusd)) {
        //     amountToFlashLoan_ = _amountToRepay;
        // } else {
        //     IPriceOracleGetter oracle = IPriceOracleGetter(
        //         addressesProvider.getPriceOracle()
        //     );
        //     (uint256 loanToValue, , , , ) = lendingPool
        //         .getConfiguration(address(dusd))
        //         .getParamsMemory();
        //     uint256 dusdPrice = oracle.getAssetPrice(address(dusd));
        //     uint256 borrowedTokenPrice = oracle.getAssetPrice(
        //         _underlyingToRepay
        //     );
        //     uint256 underlyingDecimals = ERC20(_underlyingToRepay).decimals();
        //     amountToFlashLoan_ =
        //         (((_amountToRepay * borrowedTokenPrice * 10 ** DUSD_DECIMALS) /
        //             dusdPrice /
        //             10 ** underlyingDecimals) * ONE_HUNDER_PCT_BPS) /
        //         loanToValue +
        //         1e18; // for rounding errors of supply/borrow on aave
        // }
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
