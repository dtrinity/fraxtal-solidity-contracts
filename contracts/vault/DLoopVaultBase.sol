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

import {Ownable} from "@openzeppelin/contracts-5/access/Ownable.sol";
import {DataTypes} from "contracts/lending/core/protocol/libraries/types/DataTypes.sol";
import {Constants} from "contracts/shared/Constants.sol";
import {ERC4626, ERC20, SafeERC20} from "@openzeppelin/contracts-5/token/ERC20/extensions/ERC4626.sol";
import {ISwapRouter} from "../dex/periphery/interfaces/ISwapRouter.sol";
import {IPriceOracleGetter} from "../lending/core/interfaces/IPriceOracleGetter.sol";
import {ILendingPool} from "contracts/lending_liquidator/interface/aave-v3/aave/ILendingPool.sol";
import {IPoolAddressesProvider} from "contracts/lending/core/interfaces/IPoolAddressesProvider.sol";
import {IERC3156FlashBorrower} from "contracts/lending_liquidator/interface/IERC3156FlashBorrower.sol";
import {IERC3156FlashLender} from "contracts/lending_liquidator/interface/IERC3156FlashLender.sol";
import {Math} from "@openzeppelin/contracts-5/utils/math/Math.sol";

/**
 * @title DLoopVaultBase
 * @dev A leveraged vault contract
 */
abstract contract DLoopVaultBase is ERC4626, IERC3156FlashBorrower, Ownable {
    using Math for uint256;
    using SafeERC20 for ERC20;

    /* Constants */

    bytes32 public constant FLASHLOAN_CALLBACK =
        keccak256("ERC3156FlashBorrower.onFlashLoan");
    // Note that there is a vulnerability in stable interest rate mode, so we will never use it
    // See contracts/lending/core/protocol/libraries/types/DataTypes.sol
    uint256 public constant VARIABLE_LENDING_INTERST_RATE_MODE = 2; // 0 = NONE, 1 = STABLE, 2 = VARIABLE

    /* Core state */

    uint32 public immutable TARGET_LEVERAGE_BPS; // ie. 30000 = 300% over 100% in basis points, means 3x leverage
    uint32 public immutable LOWER_BOUND_TARGET_LEVERAGE_BPS;
    uint32 public immutable UPPER_BOUND_TARGET_LEVERAGE_BPS;
    uint256 private _defaultSwapSlippageTolerance; // ie. 1000 = 10%

    IERC3156FlashLender public immutable flashLender;
    IPoolAddressesProvider public immutable lendingPoolAddressesProvider;
    ERC20 public immutable underlyingAsset;
    ERC20 public immutable dusd;
    uint256 private _defaultMaxSubsidyBps;

    /* Errors */

    error UnknownLender();
    error UnknownInitiator();
    error UnknownToken();
    error TooImbalanced(
        uint256 currentLeverageBps,
        uint256 lowerBoundTargetLeverageBps,
        uint256 upperBoundTargetLeverageBps
    );
    error InvalidTotalSupplyAndAssets(uint256 totalAssets, uint256 totalSupply);
    error DepositInsufficientToSupply(
        uint256 currentBalance,
        uint256 newTotalAssets
    );
    error UnexpectedLossOfPrincipal(
        uint256 principalBefore,
        uint256 principalAfter
    );
    error RemainingAssetsBelowMinimum(uint256 assets, uint256 minAssets);
    error CollateralLessThanDebt(
        uint256 totalCollateralBase,
        uint256 totalDebtBase
    );
    error InsufficientInputAmount(
        address token,
        uint256 estimatedInputAmount,
        uint256 currentBalance
    );
    error InsufficientShareBalanceToRedeem(
        address owner,
        uint256 sharesToRedeem,
        uint256 shareBalance
    );
    error InvalidMaxWithdrawAfterRepay(
        address token,
        uint256 maxWithdrawUnderlyingBeforeRepay,
        uint256 maxWithdrawUnderlyingAfterRepay
    );
    error WithdrawableIsLessThanRequired(
        address token,
        uint256 assetToRemoveFromLending,
        uint256 withdrawableAmount
    );
    error ExceedMaxPrice(uint256 assetPrice, uint256 maxPrice);
    error BelowMinPrice(uint256 assetPrice, uint256 minPrice);
    error DecreaseLeverageOutOfRange(
        uint256 newLeverageBps,
        uint256 targetLeverageBps, // lower bound
        uint256 currentLeverageBps // upper bound
    );
    error IncreaseLeverageOutOfRange(
        uint256 newLeverageBps,
        uint256 targetLeverageBps, // upper bound
        uint256 currentLeverageBps // lower bound
    );

    /* Structs */

    struct FlashLoanRedeemParams {
        uint256 assetsToRemoveFromLending;
        uint256 swapSlippageTolerance; // ie. 1000 = 10%
        bytes underlyingToDUSDSwapData;
    }

    struct FlashLoanDepositParams {
        uint256 depositAssetAmount;
        uint256 newTotalAssets;
        uint256 slippageTolerance; // ie. 1000 = 10%
        bytes dusdToUnderlyingSwapData;
    }

    struct FlashLoanParams {
        bool isDeposit;
        bytes params;
    }

    /**
     * @dev Constructor for the DLoopVaultBase contract
     * @param _name Name of the vault token
     * @param _symbol Symbol of the vault token
     * @param _underlyingAsset Address of the underlying asset
     * @param _dusd Address of the dUSD token
     * @param _flashLender Address of the flash loan provider
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
        IPoolAddressesProvider _lendingPoolAddressesProvider,
        uint32 _targetLeverageBps,
        uint256 _swapSlippageTolerance,
        uint256 _maxSubsidyBps
    ) ERC20(_name, _symbol) ERC4626(_underlyingAsset) Ownable(msg.sender) {
        dusd = _dusd;
        flashLender = _flashLender;
        lendingPoolAddressesProvider = _lendingPoolAddressesProvider;
        underlyingAsset = _underlyingAsset;

        if (_targetLeverageBps < Constants.ONE_HUNDRED_PERCENT_BPS) {
            revert("Target leverage must be at least 100% in basis points");
        }

        TARGET_LEVERAGE_BPS = _targetLeverageBps;
        LOWER_BOUND_TARGET_LEVERAGE_BPS = TARGET_LEVERAGE_BPS / 2;
        UPPER_BOUND_TARGET_LEVERAGE_BPS = TARGET_LEVERAGE_BPS * 2;
        _defaultSwapSlippageTolerance = _swapSlippageTolerance;
        _defaultMaxSubsidyBps = _maxSubsidyBps;
    }

    /* Swap functions - Need to override in the child contract */

    /**
     * @dev Swaps an exact amount of input assets for as much output assets as possible
     * @param inputToken Input asset
     * @param outputToken Output asset
     * @param amountOut Amount of input assets
     * @param amountInMaximum Minimum amount of output assets (slippage protection)
     * @param receiver Address to receive the output assets
     * @param deadline Deadline for the swap
     * @param extraData Additional data for the swap
     * @return amountIn Amount of input assets used for the swap
     */
    function _swapExactOutput(
        ERC20 inputToken,
        ERC20 outputToken,
        uint256 amountOut,
        uint256 amountInMaximum,
        address receiver,
        uint256 deadline,
        bytes memory extraData
    ) internal virtual returns (uint256);

    /* Safety */

    /**
     * @dev Checks if the current leverage is too imbalanced
     */
    function checkIsTooImbalanced() public view {
        uint256 currentLeverageBps = getCurrentLeverageBps();
        // If there is no deposit yet, we don't need to rebalance, thus it is not too imbalanced
        if (
            currentLeverageBps != 0 &&
            (currentLeverageBps < LOWER_BOUND_TARGET_LEVERAGE_BPS ||
                currentLeverageBps > UPPER_BOUND_TARGET_LEVERAGE_BPS)
        ) {
            revert TooImbalanced(
                currentLeverageBps,
                LOWER_BOUND_TARGET_LEVERAGE_BPS,
                UPPER_BOUND_TARGET_LEVERAGE_BPS
            );
        }
    }

    /**
     * @dev Rescues tokens accidentally sent to the contract
     * @param token Address of the token to rescue
     * @param receiver Address to receive the rescued tokens
     */
    function rescueToken(address token, address receiver) public onlyOwner {
        ERC20(token).safeTransfer(
            receiver,
            ERC20(token).balanceOf(address(this))
        );
    }

    /* Flash loan entrypoint */

    /**
     * @dev Callback function for flash loans
     * @param initiator Address that initiated the flash loan
     * @param token Address of the flash-borrowed token
     * @param data Additional data passed to the flash loan
     * @return bytes32 The flash loan callback success bytes
     */
    function onFlashLoan(
        address initiator,
        address token,
        uint256, // amount (flash loan amount)
        uint256, // fee (flash loan fee)
        bytes calldata data
    ) public returns (bytes32) {
        if (msg.sender != address(flashLender)) revert UnknownLender();
        if (initiator != address(this)) revert UnknownInitiator();
        if (token != address(dusd)) revert UnknownToken();

        FlashLoanParams memory flashLoanParams = _decodeDataToParams(data);
        if (flashLoanParams.isDeposit) {
            FlashLoanDepositParams
                memory flashLoanDepositParams = _decodeDataToDepositParams(
                    flashLoanParams.params
                );
            _onFlashLoanDeposit(flashLoanDepositParams);
        } else {
            FlashLoanRedeemParams
                memory flashLoanRedeemParams = _decodeDataToRedeemParams(
                    flashLoanParams.params
                );
            _onFlashLoanRedeem(flashLoanRedeemParams);
        }

        return FLASHLOAN_CALLBACK;
    }

    /* Deposit */

    /**
     * @dev Deposits assets into the vault
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive the minted shares
     * @return shares Amount of shares minted
     */
    function deposit(
        uint256 assets, // deposit amount
        address receiver
    ) public override returns (uint256 shares) {
        // 0x means to use default swap data
        return depositWith(assets, receiver, _defaultSwapSlippageTolerance, "");
    }

    /**
     * @dev Deposits assets into the vault with custom parameters
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive the minted shares
     * @param slippageTolerance Slippage tolerance for the swap
     * @param dusdToUnderlyingSwapData Swap data from dUSD to underlying asset
     * @return shares Amount of shares minted
     */
    function depositWith(
        uint256 assets, // deposit amount
        address receiver,
        uint256 slippageTolerance,
        bytes memory dusdToUnderlyingSwapData
    ) public returns (uint256 shares) {
        shares = convertToShares(assets);
        _depositWithImplementation(
            assets,
            shares,
            receiver,
            slippageTolerance,
            dusdToUnderlyingSwapData
        );
        return shares;
    }

    /**
     * @dev Deposits assets into the vault with custom parameters
     * @param assets Amount of assets to deposit
     * @param shares Amount of shares to mint
     * @param receiver Address to receive the minted shares
     * @param slippageTolerance Slippage tolerance for the swap
     * @param dusdToUnderlyingSwapData Swap data from dUSD to underlying asset
     */
    function _depositWithImplementation(
        uint256 assets, // deposit amount
        uint256 shares, // mint amount of shares
        address receiver,
        uint256 slippageTolerance,
        bytes memory dusdToUnderlyingSwapData
    ) private {
        // Make sure the current leverage is within the target range
        checkIsTooImbalanced();

        // Transfer the assets to the vault (need the allowance before calling this function)
        underlyingAsset.safeTransferFrom(msg.sender, address(this), assets);

        _depositToPoolImplementation(
            assets,
            slippageTolerance,
            dusdToUnderlyingSwapData
        );

        // Mint the vault's shares to the depositor
        _mint(receiver, shares);

        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function _depositToPoolImplementation(
        uint256 assets, // deposit amount
        uint256 slippageTolerance,
        bytes memory dusdToUnderlyingSwapData
    ) private {
        // At this step, we assume that the funds from the depositor are already in the vault

        uint256 newTotalAssets = (assets * TARGET_LEVERAGE_BPS) /
            Constants.ONE_HUNDRED_PERCENT_BPS;

        FlashLoanParams memory params = FlashLoanParams(
            true,
            _encodeDepositParamsToData(
                FlashLoanDepositParams(
                    assets,
                    newTotalAssets,
                    slippageTolerance,
                    dusdToUnderlyingSwapData
                )
            )
        );
        bytes memory data = _encodeParamsToData(params);

        uint256 maxFlashLoanAmount = flashLender.maxFlashLoan(address(dusd));

        // We need to approve the flash lender to spend the dUSD
        // Reference: https://soliditydeveloper.com/eip-3156
        require(
            dusd.approve(
                address(flashLender),
                maxFlashLoanAmount +
                    flashLender.flashFee(address(dusd), maxFlashLoanAmount)
            ),
            "approve failed for flash lender in deposit"
        );

        // The remaining logic will be in the _onFlashLoanDeposit() function
        flashLender.flashLoan(this, address(dusd), maxFlashLoanAmount, data);
    }

    /**
     * @dev Mints shares to the receiver by depositing assets
     * @param shares Amount of shares to mint
     * @param receiver Address to receive the minted shares
     * @return assets Amount of assets deposited
     */
    function mint(
        uint256 shares,
        address receiver
    ) public override returns (uint256 assets) {
        assets = convertToAssets(shares);
        _depositWithImplementation(
            assets,
            shares,
            receiver,
            _defaultSwapSlippageTolerance,
            "" // use default swap data
        );
        return assets;
    }

    /**
     * @dev Mints shares to the receiver by depositing assets with custom parameters
     * @param shares Amount of shares to mint
     * @param receiver Address to receive the minted shares
     * @param slippageTolerance Slippage tolerance for the swap
     * @param dusdToUnderlyingSwapData Swap data from dUSD to underlying asset
     * @return assets Amount of assets deposited
     */
    function mintWith(
        uint256 shares,
        address receiver,
        uint256 slippageTolerance,
        bytes memory dusdToUnderlyingSwapData
    ) public returns (uint256 assets) {
        assets = convertToAssets(shares);
        _depositWithImplementation(
            assets,
            shares,
            receiver,
            slippageTolerance,
            dusdToUnderlyingSwapData
        );
        return assets;
    }

    /**
     * @dev Internal function to handle flash loan deposit
     * @param flashLoanParams Parameters for the flash loan deposit
     */
    function _onFlashLoanDeposit(
        FlashLoanDepositParams memory flashLoanParams
    ) internal {
        IPriceOracleGetter lendingOracle = _getLendingOracle();

        uint256 requiredAdditionalAssets = flashLoanParams.newTotalAssets -
            flashLoanParams.depositAssetAmount;

        uint256 estimatedInputAmount = (requiredAdditionalAssets *
            (
                (lendingOracle.getAssetPrice(address(underlyingAsset)) *
                    (10 ** dusd.decimals()))
            )) /
            (lendingOracle.getAssetPrice(address(dusd)) *
                (10 ** underlyingAsset.decimals()));

        // Calculate the max input amount with slippage tolerance
        uint256 maxIn = (estimatedInputAmount *
            (Constants.ONE_HUNDRED_PERCENT_BPS +
                flashLoanParams.slippageTolerance)) /
            Constants.ONE_HUNDRED_PERCENT_BPS;
        require(maxIn > 0, "maxIn is not positive");

        // Swap from dUSD to the underlying asset
        uint256 dusdUsedInSwap = _swapExactOutput(
            dusd,
            underlyingAsset,
            requiredAdditionalAssets,
            maxIn,
            address(this),
            block.timestamp,
            flashLoanParams.dusdToUnderlyingSwapData
        );

        // Make sure we have enough balance to supply before supplying
        uint256 currentUnderlyingAssetBalance = underlyingAsset.balanceOf(
            address(this)
        );
        if (currentUnderlyingAssetBalance < flashLoanParams.newTotalAssets) {
            revert DepositInsufficientToSupply(
                currentUnderlyingAssetBalance,
                flashLoanParams.newTotalAssets
            );
        }

        ILendingPool lendingPool = _getLendingPool();

        // Approve the lending pool to spend the underlying asset
        require(
            underlyingAsset.approve(
                address(lendingPool),
                flashLoanParams.newTotalAssets
            ),
            "approve failed for lending pool in deposit"
        );

        // Supply the underlying asset to the lending pool
        lendingPool.supply(
            address(underlyingAsset),
            flashLoanParams.newTotalAssets,
            address(this),
            0
        );

        // Borrow dUSD to repay the flash loan
        lendingPool.borrow(address(dusd), dusdUsedInSwap, 2, 0, address(this));

        // Then, the dusdUsedInSwap here will be used to repay the flash loan (not for the lending pool borrow above)
    }

    /* Redeem */

    /**
     * @dev Redeems shares from the vault
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive the assets
     * @param owner Address that owns the shares
     * @return assets Amount of assets redeemed
     */
    function redeem(
        uint256 shares, // redeem amount of shares
        address receiver,
        address owner
    ) public override returns (uint256 assets) {
        return
            redeemWith(
                shares,
                receiver,
                owner,
                _defaultSwapSlippageTolerance,
                0, // receive as much as possible
                "" // use default swap data
            );
    }

    /**
     * @dev Redeems shares from the vault with custom parameters
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive the assets
     * @param owner Address that owns the shares
     * @param swapSlippageTolerance Slippage tolerance for the swap
     * @param minReceiveAmount Minimum amount of assets to receive
     * @param underlyingToDUSDSwapData Swap data from underlying asset to DUSD
     * @return assets Amount of assets redeemed
     */
    function redeemWith(
        uint256 shares, // redeem amount of shares
        address receiver,
        address owner,
        uint256 swapSlippageTolerance,
        uint256 minReceiveAmount,
        bytes memory underlyingToDUSDSwapData
    ) public returns (uint256 assets) {
        assets = convertToAssets(shares);
        _redeemWithImplementation(
            assets,
            shares,
            receiver,
            owner,
            swapSlippageTolerance,
            minReceiveAmount,
            underlyingToDUSDSwapData
        );
        return assets;
    }

    /**
     * @dev Redeems shares from the vault with custom parameters
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive the assets
     * @param owner Address that owns the shares
     * @param swapSlippageTolerance Slippage tolerance for the swap
     * @param minReceiveAmount Minimum amount of assets to receive
     * @param underlyingToDUSDSwapData Swap data from underlying asset to dUSD
     * @return outputAssets Amount of assets redeemed
     */
    function _redeemWithImplementation(
        uint256 finalAssetsRequired, // amount of assets to getting back
        uint256 shares, // redeem amount of shares
        address receiver,
        address owner,
        uint256 swapSlippageTolerance,
        uint256 minReceiveAmount,
        bytes memory underlyingToDUSDSwapData
    ) private returns (uint256 outputAssets) {
        // Make sure the current leverage is within the target range
        checkIsTooImbalanced();

        // Note that we need the allowance before calling this function
        // - Allowance for the message sender to spend the shares on behalf of the owner
        // - Allowance for the vault to burn the shares

        // If the owner is not the sender, then we need to spend the allowance
        // so that the msg.sender can spend the shares on behalf of the owner
        if (owner != msg.sender) {
            _spendAllowance(owner, msg.sender, shares);
        }

        uint256 assetsToRemoveFromLending = (finalAssetsRequired *
            TARGET_LEVERAGE_BPS) / Constants.ONE_HUNDRED_PERCENT_BPS;

        uint256 maxFlashLoanAmount = flashLender.maxFlashLoan(address(dusd));

        FlashLoanParams memory params = FlashLoanParams(
            false,
            _encodeRedeemParamsToData(
                FlashLoanRedeemParams(
                    assetsToRemoveFromLending,
                    swapSlippageTolerance,
                    underlyingToDUSDSwapData
                )
            )
        );
        bytes memory data = _encodeParamsToData(params);

        uint256 underlyingAssetBalanceBefore = underlyingAsset.balanceOf(
            address(this)
        );

        // We need to approve the flash lender to spend the dUSD
        // Reference: https://soliditydeveloper.com/eip-3156
        require(
            dusd.approve(
                address(flashLender),
                maxFlashLoanAmount +
                    flashLender.flashFee(address(dusd), maxFlashLoanAmount)
            ),
            "approve failed for flash lender in redeem"
        );

        // The remaining logic will be in the _onFlashLoanRedeem() function
        flashLender.flashLoan(this, address(dusd), maxFlashLoanAmount, data);

        // Check user's balance before burning shares
        uint256 userShares = balanceOf(owner);
        if (userShares < shares) {
            revert InsufficientShareBalanceToRedeem(owner, shares, userShares);
        }

        // Burn the shares
        _burn(owner, shares);

        uint256 underlyingAssetBalanceAfter = underlyingAsset.balanceOf(
            address(this)
        );

        // The balance before and after the flash loan check is used to allow having external fund to redeem() (with loss)
        // in case the flash loan is not enough to redeem the exact amount of collateral
        if (underlyingAssetBalanceAfter < underlyingAssetBalanceBefore) {
            revert UnexpectedLossOfPrincipal(
                underlyingAssetBalanceBefore,
                underlyingAssetBalanceAfter
            );
        }

        uint256 remainingAssets = underlyingAssetBalanceAfter -
            underlyingAssetBalanceBefore;

        // Slippage protection
        if (remainingAssets < minReceiveAmount) {
            revert RemainingAssetsBelowMinimum(
                remainingAssets,
                minReceiveAmount
            );
        } else if (remainingAssets > finalAssetsRequired) {
            // Deposit back the remaining assets to the vault
            _depositToPoolImplementation(
                remainingAssets - finalAssetsRequired,
                swapSlippageTolerance,
                "" // use default swap data
            );
            remainingAssets = finalAssetsRequired;
        }

        // Transfer the remaining assets to the receiver
        underlyingAsset.safeTransfer(receiver, remainingAssets);

        outputAssets = remainingAssets;
        emit Withdraw(msg.sender, receiver, owner, outputAssets, shares);
    }

    /**
     * @dev Withdraws assets from the vault
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive the assets
     * @param owner Address that owns the shares
     * @return shares Amount of shares burned
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override returns (uint256 shares) {
        return
            withdrawWith(
                assets,
                receiver,
                owner,
                _defaultSwapSlippageTolerance,
                0, // receive as much as possible
                "" // use default swap data
            );
    }

    /**
     * @dev Withdraws assets from the vault with custom parameters
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive the assets
     * @param owner Address that owns the shares
     * @param swapSlippageTolerance Slippage tolerance for the swap
     * @param minReceiveAmount Minimum amount of assets to receive
     * @param underlyingToDUSDSwapData Swap data from underlying asset to dUSD
     * @return shares Amount of shares burned
     */
    function withdrawWith(
        uint256 assets,
        address receiver,
        address owner,
        uint256 swapSlippageTolerance,
        uint256 minReceiveAmount,
        bytes memory underlyingToDUSDSwapData
    ) public returns (uint256 shares) {
        // Calculate the number of shares to burn based on the assets to withdraw
        shares = convertToShares(assets);
        _redeemWithImplementation(
            assets,
            shares,
            receiver,
            owner,
            swapSlippageTolerance,
            minReceiveAmount,
            underlyingToDUSDSwapData
        );
        return shares;
    }

    /**
     * @dev Internal function to handle flash loan redeem
     * @param flashLoanParams Parameters for the flash loan redeem
     */
    function _onFlashLoanRedeem(
        FlashLoanRedeemParams memory flashLoanParams
    ) internal {
        ILendingPool lendingPool = _getLendingPool();
        IPriceOracleGetter lendingOracle = _getLendingOracle();

        uint256 maxWithdrawUnderlyingBeforeRepay = _getMaxWithdrawAmount(
            address(this),
            address(underlyingAsset)
        );

        // The repay amount with repay slippage tolerance (overhead in the repay amount to make sure
        // we can withdraw the exact amount of collateral)
        uint256 dusdToRepay = ((flashLoanParams.assetsToRemoveFromLending *
            (lendingOracle.getAssetPrice(address(underlyingAsset)) *
                10 ** dusd.decimals())) /
            (lendingOracle.getAssetPrice(address(dusd)) *
                10 ** underlyingAsset.decimals()));

        // Approve the lending pool to spend the dUSD
        require(
            dusd.approve(address(lendingPool), dusdToRepay),
            "approve failed for lending pool in redeem"
        );

        uint256 currentLeverageBps = getCurrentLeverageBps();

        // Repay the debt to withdraw the collateral
        // The repaidDUSDAmount can be less than dusdToRepay in case the
        // actual debt is less than the repay amount
        uint256 repaidDUSDAmount = lendingPool.repay(
            address(dusd),
            dusdToRepay,
            VARIABLE_LENDING_INTERST_RATE_MODE,
            address(this)
        );

        uint256 maxWithdrawUnderlyingAfterRepay = _getMaxWithdrawAmount(
            address(this),
            address(underlyingAsset)
        );

        // Make sure the max withdraw amount of underlying asset is not decreased after repaying the debt
        if (
            maxWithdrawUnderlyingAfterRepay < maxWithdrawUnderlyingBeforeRepay
        ) {
            revert InvalidMaxWithdrawAfterRepay(
                address(underlyingAsset),
                maxWithdrawUnderlyingBeforeRepay,
                maxWithdrawUnderlyingAfterRepay
            );
        }

        uint256 withdrawableUnderlyingAmount = _getWithdrawAmountThatKeepCurrentLeverage(
                maxWithdrawUnderlyingBeforeRepay,
                maxWithdrawUnderlyingAfterRepay,
                currentLeverageBps
            );

        if (
            withdrawableUnderlyingAmount <
            flashLoanParams.assetsToRemoveFromLending
        ) {
            revert WithdrawableIsLessThanRequired(
                address(underlyingAsset),
                flashLoanParams.assetsToRemoveFromLending,
                withdrawableUnderlyingAmount
            );
        }

        // Withdraw the collateral
        // The actual withdrawn amount can be less than withdrawableUnderlyingAmount in case the
        // actual collateral is less than the withdraw amount
        lendingPool.withdraw(
            address(underlyingAsset),
            withdrawableUnderlyingAmount,
            address(this)
        );

        // Convert from repaid dUSD to the corresponding amount of underlying asset
        uint256 estimatedInputAmount = (repaidDUSDAmount *
            (
                (lendingOracle.getAssetPrice(address(dusd)) *
                    (10 ** underlyingAsset.decimals()))
            )) /
            (lendingOracle.getAssetPrice(address(underlyingAsset)) *
                (10 ** dusd.decimals()));

        uint256 underlyingAssetBalance = underlyingAsset.balanceOf(
            address(this)
        );
        if (underlyingAssetBalance < estimatedInputAmount) {
            revert InsufficientInputAmount(
                address(underlyingAsset),
                estimatedInputAmount,
                underlyingAssetBalance
            );
        }

        // The maxIn can be greater than flashLoanParams.assetsToRemoveFromLending in case we add som external
        // funds to the vault to redeem() (with loss)
        uint256 maxIn = (estimatedInputAmount *
            (Constants.ONE_HUNDRED_PERCENT_BPS +
                flashLoanParams.swapSlippageTolerance)) /
            Constants.ONE_HUNDRED_PERCENT_BPS;
        require(maxIn > 0, "maxIn is 0");

        // Swap from the underlying asset to dUSD to repay the flash loan
        _swapExactOutput(
            underlyingAsset,
            dusd,
            repaidDUSDAmount,
            maxIn,
            address(this),
            block.timestamp,
            flashLoanParams.underlyingToDUSDSwapData
        );

        // Then, the repaidDUSDAmount here will be used to repay the flash loan (not for the lending pool repay above)
    }

    /**
     * @dev Gets the maximum withdrawable amount of an asset
     * @param user Address of the user
     * @param asset Address of the asset
     * @return uint256 Maximum withdrawable amount of the asset
     */
    function _getMaxWithdrawAmount(
        address user,
        address asset
    ) internal view returns (uint256) {
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,

        ) = _getLendingPool().getUserAccountData(user);
        uint256 assetPriceInBase = _getLendingOracle().getAssetPrice(asset);
        uint256 maxWithdrawInBase = totalCollateralBase - totalDebtBase;

        uint256 assetTokenUnit = 10 ** ERC20(asset).decimals();
        return (maxWithdrawInBase * assetTokenUnit) / assetPriceInBase;
    }

    /**
     * @dev Gets the withdrawable amount that keeps the current leverage
     * @param maxWithdrawAmountBeforeRepay Maximum withdrawable amount before repaying
     * @param maxWithdrawAmountAfterRepay Maximum withdrawable amount after repaying
     * @param currentLeverageBps Current leverage in basis points
     * @return uint256 Withdrawable amount that keeps the current leverage
     */
    function _getWithdrawAmountThatKeepCurrentLeverage(
        uint256 maxWithdrawAmountBeforeRepay,
        uint256 maxWithdrawAmountAfterRepay,
        uint256 currentLeverageBps
    ) internal pure returns (uint256) {
        // Assume the maxWithdrawAmountBeforeRepay and maxWithdrawAmountAfterRepay are in the same unit
        //
        // Formula definition:
        // - C1: totalCollateralBase before repay
        // - D1: totalDebtBase before repay
        // - C2: totalCollateralBase after repay
        // - D2: totalDebtBase after repay
        // - T: target leverage
        // - x: withdraw amount
        // - y: repay amount
        //
        // We have:
        //        C1 / (C1-D1) = C2 / (C2-D2)
        //        C2 = C1-x
        //        D2 = D1-y
        //        C1 / (C1-D1) = T <=> C1 = (C1-D1) * T <=> C1 = C1*T - D1*T <=> C1*T - C1 = D1*T <=> C1 = D1*T/(T-1)
        //
        // Formula expression:
        //        C1 / (C1-D1) = (C1-x) / (C1-x-D1+y)
        //    <=> C1 * (C1-x-D1+y) = (C1-x) * (C1-D1)
        //    <=> C1^2 - C1*x - C1*D1 + C1*y = C1^2 - C1*D1 - C1*x + D1*x
        //    <=> C1^2 - C1*x - C1*D1 + C1*y = C1^2 - C1*x - C1*D1 + D1*x
        //    <=> C1*y = x*D1
        //    <=> y = x*D1 / C1
        //    <=> y = x*D1 / [D1*T / (T-1)]
        //    <=> y = x * (T-1)/T
        //    <=> x = y * T/(T-1)
        //
        uint256 difference = maxWithdrawAmountAfterRepay -
            maxWithdrawAmountBeforeRepay;

        // Instead of using TARGET_LEVERAGE_BPS, we use the current leverage to calculate the withdrawable amount to avoid
        // unexpectedly changing the current leverage (which may cause loss to the user)
        if (currentLeverageBps <= Constants.ONE_HUNDRED_PERCENT_BPS) {
            // If there is no more debt, withdraw as much as possible
            return type(uint256).max;
        }

        return
            (difference * currentLeverageBps) /
            (currentLeverageBps - Constants.ONE_HUNDRED_PERCENT_BPS);
    }

    /**
     * @dev Encodes flash loan parameters to data
     * @param _flashLoanParams Flash loan parameters
     * @return data Encoded data
     */
    function _encodeParamsToData(
        FlashLoanParams memory _flashLoanParams
    ) internal pure returns (bytes memory data) {
        data = abi.encode(_flashLoanParams.isDeposit, _flashLoanParams.params);
    }

    /**
     * @dev Decodes data to flash loan parameters
     * @param data Encoded data
     * @return _flashLoanParams Decoded flash loan parameters
     */
    function _decodeDataToParams(
        bytes calldata data
    ) internal pure returns (FlashLoanParams memory _flashLoanParams) {
        (_flashLoanParams.isDeposit, _flashLoanParams.params) = abi.decode(
            data,
            (bool, bytes)
        );
    }

    /**
     * @dev Encodes flash loan deposit parameters to data
     * @param _flashLoanDepositParams Flash loan deposit parameters
     * @return data Encoded data
     */
    function _encodeDepositParamsToData(
        FlashLoanDepositParams memory _flashLoanDepositParams
    ) internal pure returns (bytes memory data) {
        data = abi.encode(
            _flashLoanDepositParams.depositAssetAmount,
            _flashLoanDepositParams.newTotalAssets,
            _flashLoanDepositParams.slippageTolerance,
            _flashLoanDepositParams.dusdToUnderlyingSwapData
        );
    }

    /**
     * @dev Decodes data to flash loan deposit parameters
     * @param data Encoded data
     * @return _flashLoanDepositParams Decoded flash loan deposit parameters
     */
    function _decodeDataToDepositParams(
        bytes memory data
    )
        internal
        pure
        returns (FlashLoanDepositParams memory _flashLoanDepositParams)
    {
        (
            _flashLoanDepositParams.depositAssetAmount,
            _flashLoanDepositParams.newTotalAssets,
            _flashLoanDepositParams.slippageTolerance,
            _flashLoanDepositParams.dusdToUnderlyingSwapData
        ) = abi.decode(data, (uint256, uint256, uint256, bytes));
    }

    /**
     * @dev Encodes flash loan redeem parameters to data
     * @param _flashLoanRedeemParams Flash loan redeem parameters
     * @return data Encoded data
     */
    function _encodeRedeemParamsToData(
        FlashLoanRedeemParams memory _flashLoanRedeemParams
    ) internal pure returns (bytes memory data) {
        data = abi.encode(
            _flashLoanRedeemParams.assetsToRemoveFromLending,
            _flashLoanRedeemParams.swapSlippageTolerance,
            _flashLoanRedeemParams.underlyingToDUSDSwapData
        );
    }

    /**
     * @dev Decodes data to flash loan redeem parameters
     * @param data Encoded data
     * @return _flashLoanRedeemParams Decoded flash loan redeem parameters
     */
    function _decodeDataToRedeemParams(
        bytes memory data
    )
        internal
        pure
        returns (FlashLoanRedeemParams memory _flashLoanRedeemParams)
    {
        (
            _flashLoanRedeemParams.assetsToRemoveFromLending,
            _flashLoanRedeemParams.swapSlippageTolerance,
            _flashLoanRedeemParams.underlyingToDUSDSwapData
        ) = abi.decode(data, (uint256, uint256, bytes));
    }

    /* Rebalance */

    function increaseLeverage(
        uint256 assetAmount,
        uint256 minPriceInBase
    ) public {
        IPriceOracleGetter lendingOracle = _getLendingOracle();

        uint256 assetPriceInBase = lendingOracle.getAssetPrice(
            address(underlyingAsset)
        );
        if (assetPriceInBase < minPriceInBase) {
            revert BelowMinPrice(assetPriceInBase, minPriceInBase);
        }

        uint256 assetAmountInBase = (assetAmount * assetPriceInBase) /
            (10 ** underlyingAsset.decimals());

        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,

        ) = _getLendingPool().getUserAccountData(address(this));

        uint256 currentSubsidyBps = _getCurrentSubsidyBps();

        uint256 dusdPriceInBase = lendingOracle.getAssetPrice(address(dusd));
        uint256 borrowedDUSDInBase = (assetAmountInBase *
            (Constants.ONE_HUNDRED_PERCENT_BPS + currentSubsidyBps)) /
            Constants.ONE_HUNDRED_PERCENT_BPS;

        uint256 newLeverageBps = ((totalCollateralBase + assetAmountInBase) *
            Constants.ONE_HUNDRED_PERCENT_BPS) /
            (totalCollateralBase +
                assetAmountInBase -
                totalDebtBase -
                borrowedDUSDInBase);

        uint256 currentLeverageBps = getCurrentLeverageBps();

        if (
            newLeverageBps > TARGET_LEVERAGE_BPS ||
            newLeverageBps <= currentLeverageBps
        ) {
            revert IncreaseLeverageOutOfRange(
                newLeverageBps,
                TARGET_LEVERAGE_BPS,
                currentLeverageBps
            );
        }

        // Transfer the asset to the vault to supply
        underlyingAsset.safeTransferFrom(
            msg.sender,
            address(this),
            assetAmount
        );

        // Approve the lending pool to spend the asset
        require(
            underlyingAsset.approve(address(_getLendingPool()), assetAmount),
            "approve failed for lending pool in increase leverage"
        );

        // Supply the asset to the lending pool
        _getLendingPool().supply(
            address(underlyingAsset),
            assetAmount,
            address(this),
            0
        );

        // Borrow more dUSD
        uint256 borrowedDUSD = (borrowedDUSDInBase * (10 ** dusd.decimals())) /
            dusdPriceInBase;
        _getLendingPool().borrow(
            address(dusd),
            borrowedDUSD,
            VARIABLE_LENDING_INTERST_RATE_MODE,
            0,
            address(this)
        );

        // Transfer the dUSD to the user
        dusd.safeTransfer(msg.sender, borrowedDUSD);
    }

    function decreaseLeverage(
        uint256 dusdAmount,
        uint256 maxPriceInBase
    ) public {
        IPriceOracleGetter lendingOracle = _getLendingOracle();

        uint256 assetPriceInBase = lendingOracle.getAssetPrice(
            address(underlyingAsset)
        );
        if (assetPriceInBase > maxPriceInBase) {
            revert ExceedMaxPrice(assetPriceInBase, maxPriceInBase);
        }

        uint256 dusdAmountInBase = (dusdAmount *
            lendingOracle.getAssetPrice(address(dusd))) /
            (10 ** dusd.decimals());

        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,

        ) = _getLendingPool().getUserAccountData(address(this));

        uint256 currentSubsidyBps = _getCurrentSubsidyBps();
        uint256 withdrawnAssetsBase = (dusdAmountInBase *
            (Constants.ONE_HUNDRED_PERCENT_BPS + currentSubsidyBps)) /
            Constants.ONE_HUNDRED_PERCENT_BPS;

        uint256 newLeverageBps = ((totalCollateralBase - withdrawnAssetsBase) *
            Constants.ONE_HUNDRED_PERCENT_BPS) /
            (totalCollateralBase -
                withdrawnAssetsBase -
                totalDebtBase +
                dusdAmountInBase);

        uint256 currentLeverageBps = getCurrentLeverageBps();
        if (
            newLeverageBps < TARGET_LEVERAGE_BPS ||
            newLeverageBps >= currentLeverageBps
        ) {
            revert DecreaseLeverageOutOfRange(
                newLeverageBps,
                TARGET_LEVERAGE_BPS,
                currentLeverageBps
            );
        }

        // Transfer the dUSD to the vault to repay the debt
        dusd.safeTransferFrom(msg.sender, address(this), dusdAmount);

        // Approve the lending pool to spend the dUSD
        require(
            dusd.approve(address(_getLendingPool()), dusdAmount),
            "approve failed for lending pool in decrease leverage"
        );

        // Repay the debt
        _getLendingPool().repay(
            address(dusd),
            dusdAmount,
            VARIABLE_LENDING_INTERST_RATE_MODE,
            address(this)
        );

        // Withdraw collateral
        uint256 withdrawnAssets = (withdrawnAssetsBase *
            (10 ** underlyingAsset.decimals())) / assetPriceInBase;
        _getLendingPool().withdraw(
            address(underlyingAsset),
            withdrawnAssets,
            address(this)
        );

        // Transfer the withdrawn assets to the user
        underlyingAsset.safeTransfer(msg.sender, withdrawnAssets);
    }

    function _getCurrentSubsidyBps() internal view returns (uint256) {
        uint256 currentLeverageBps = getCurrentLeverageBps();

        uint256 subsidyBps;
        if (currentLeverageBps > TARGET_LEVERAGE_BPS) {
            subsidyBps =
                ((currentLeverageBps - TARGET_LEVERAGE_BPS) *
                    Constants.ONE_HUNDRED_PERCENT_BPS) /
                TARGET_LEVERAGE_BPS;
        } else {
            subsidyBps =
                ((TARGET_LEVERAGE_BPS - currentLeverageBps) *
                    Constants.ONE_HUNDRED_PERCENT_BPS) /
                TARGET_LEVERAGE_BPS;
        }
        if (subsidyBps > _defaultMaxSubsidyBps) {
            return _defaultMaxSubsidyBps;
        }
        return subsidyBps;
    }

    /* LBP utilities */

    function getOracleAddress() public view returns (address) {
        return address(_getLendingOracle());
    }

    /**
     * @dev Internal function to get the lending oracle
     * @return IPriceOracleGetter The lending oracle interface
     */
    function _getLendingOracle() internal view returns (IPriceOracleGetter) {
        return
            IPriceOracleGetter(lendingPoolAddressesProvider.getPriceOracle());
    }

    /**
     * @dev Internal function to get the lending pool
     * @return ILendingPool The lending pool interface
     */
    function _getLendingPool() internal view returns (ILendingPool) {
        return ILendingPool(lendingPoolAddressesProvider.getPool());
    }

    function getLendingPoolAddress() public view returns (address) {
        return address(_getLendingPool());
    }

    function _getReserveData(
        address tokenAddress
    ) internal view returns (DataTypes.ReserveData memory) {
        return _getLendingPool().getReserveData(tokenAddress);
    }

    function _getDTokenAddress(
        address tokenAddress
    ) internal view returns (address) {
        return _getReserveData(tokenAddress).aTokenAddress;
    }

    function getDTokenBalance(
        address tokenAddress
    ) public view returns (uint256) {
        return ERC20(_getDTokenAddress(tokenAddress)).balanceOf(address(this));
    }

    /* Informational */

    function getCurrentLeverageBps() public view returns (uint256) {
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,

        ) = _getLendingPool().getUserAccountData(address(this));
        if (totalCollateralBase < totalDebtBase) {
            revert CollateralLessThanDebt(totalCollateralBase, totalDebtBase);
        }
        if (totalCollateralBase == 0) {
            return 0;
        }
        if (totalCollateralBase == totalDebtBase) {
            return type(uint256).max; // infinite leverage
        }
        // The leverage will be 1 if totalDebtBase is 0 (no more debt)
        return ((totalCollateralBase * Constants.ONE_HUNDRED_PERCENT_BPS) /
            (totalCollateralBase - totalDebtBase));
    }

    function _convertToShares(
        uint256 assets,
        Math.Rounding rounding
    ) internal view virtual override returns (uint256) {
        // We override this function to convert the assets to shares in the correct way
        uint256 totalSupplyAmount = totalSupply();
        // If there is no supply yet, we just mint the shares with the same amount of assets
        if (totalSupplyAmount == 0) {
            // 1:1 conversion
            return assets;
        }
        uint256 totalAssetsAmount = totalAssets();
        if (totalAssetsAmount == 0) {
            revert InvalidTotalSupplyAndAssets(
                totalAssetsAmount,
                totalSupplyAmount
            );
        }
        return
            assets.mulDiv(
                totalSupplyAmount + 10 ** _decimalsOffset(),
                totalAssetsAmount + 1,
                rounding
            );
    }

    function totalAssets() public view virtual override returns (uint256) {
        (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            ,
            ,
            ,

        ) = _getLendingPool().getUserAccountData(address(this));
        // We override this function to return the total assets in the vault
        // with respect to the position in the lending pool
        // The dLend interest will be distributed to the dToken
        if (totalCollateralBase < totalDebtBase) {
            revert CollateralLessThanDebt(totalCollateralBase, totalDebtBase);
        }

        IPriceOracleGetter lendingOracle = _getLendingOracle();

        uint256 actualValueBase = totalCollateralBase - totalDebtBase;
        uint256 underlyingAssetPriceInBase = lendingOracle.getAssetPrice(
            address(underlyingAsset)
        );
        // Convert the actual value to the base unit of the underlying asset
        return
            (actualValueBase * (10 ** underlyingAsset.decimals())) /
            underlyingAssetPriceInBase;
    }

    function getUnderlyingAssetAddress() public view returns (address) {
        return this.asset();
    }

    function getDUSDAddress() public view returns (address) {
        return address(dusd);
    }

    function getDefaultSwapSlippageTolerance() public view returns (uint256) {
        return _defaultSwapSlippageTolerance;
    }

    function getDefaultMaxSubsidyBps() public view returns (uint256) {
        return _defaultMaxSubsidyBps;
    }

    /* Admin */

    /**
     * @dev Sets the maximum subsidy in basis points
     * @param _maxSubsidyBps New maximum subsidy in basis points
     */
    function setMaxSubsidyBps(uint256 _maxSubsidyBps) public onlyOwner {
        _defaultMaxSubsidyBps = _maxSubsidyBps;
    }

    /**
     * @dev Sets the default swap slippage tolerance
     * @param _swapSlippageTolerance New default swap slippage tolerance
     */
    function setDefaultSwapSlippageTolerance(
        uint256 _swapSlippageTolerance
    ) public onlyOwner {
        _defaultSwapSlippageTolerance = _swapSlippageTolerance;
    }
}
