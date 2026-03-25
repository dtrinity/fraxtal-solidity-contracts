// SPDX-License-Identifier: BUSL-1.1
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

pragma solidity ^0.8.10;

import { Ownable } from "../dependencies/openzeppelin/contracts/Ownable.sol";
import { IAToken } from "../interfaces/IAToken.sol";
import { IPool } from "../interfaces/IPool.sol";
import { IPoolConfigurator } from "../interfaces/IPoolConfigurator.sol";
import { ReserveConfiguration } from "../protocol/libraries/configuration/ReserveConfiguration.sol";
import { ConfiguratorInputTypes } from "../protocol/libraries/types/ConfiguratorInputTypes.sol";
import { DataTypes } from "../protocol/libraries/types/DataTypes.sol";

/**
 * @title AtomicMarketListingHelper
 * @notice Stages new reserves in a safe non-live configuration and atomically enables them only
 *         after the reserve has been seeded above an explicit aToken supply floor.
 * @dev This helper is intended to close the empty/near-empty market window described in the
 *      dLEND incident materials. It does not replace protocol-level fixes for the broader
 *      dust-supply / liquidity-index inflation class.
 */
contract AtomicMarketListingHelper is Ownable {
    using ReserveConfiguration for DataTypes.ReserveConfigurationMap;

    struct StageReserveInput {
        address asset;
        uint256 reserveFactor;
        uint256 supplyCap;
        uint256 debtCeiling;
    }

    struct InitAndStageReserveInput {
        address aTokenImpl;
        address stableDebtTokenImpl;
        address variableDebtTokenImpl;
        uint8 underlyingAssetDecimals;
        address interestRateStrategyAddress;
        address underlyingAsset;
        address treasury;
        address incentivesController;
        string aTokenName;
        string aTokenSymbol;
        string variableDebtTokenName;
        string variableDebtTokenSymbol;
        string stableDebtTokenName;
        string stableDebtTokenSymbol;
        bytes params;
        uint256 reserveFactor;
        uint256 supplyCap;
        uint256 debtCeiling;
    }

    struct EnableReserveInput {
        address asset;
        uint256 baseLTV;
        uint256 liquidationThreshold;
        uint256 liquidationBonus;
        uint256 reserveFactor;
        uint256 borrowCap;
        uint256 supplyCap;
        uint256 debtCeiling;
        uint256 unbackedMintCap;
        uint256 liquidationProtocolFee;
        bool borrowableInIsolation;
        bool borrowingEnabled;
        bool stableBorrowingEnabled;
        bool flashLoanEnabled;
        uint256 minATokenSupply;
    }

    error ReserveAlreadyInitialized(address asset);
    error ReserveNotInitialized(address asset);
    error ReserveInactive(address asset);
    error ReservePaused(address asset);
    error ReserveMustBeSeedlessToStage(address asset, uint256 currentATokenSupply);
    error ReserveCollateralAlreadyEnabled(address asset);
    error ReserveBorrowingAlreadyEnabled(address asset);
    error ReserveStableBorrowingAlreadyEnabled(address asset);
    error ReserveFlashLoansAlreadyEnabled(address asset);
    error StableBorrowingRequiresBorrowing(address asset);
    error MinATokenSupplyRequired(address asset);
    error InsufficientATokenSupply(address asset, uint256 currentATokenSupply, uint256 requiredATokenSupply);
    error DebtCeilingMustBeStagedBeforeSeeding(
        address asset,
        uint256 currentATokenSupply,
        uint256 currentDebtCeiling,
        uint256 requestedDebtCeiling
    );

    event ReserveStaged(address indexed asset, uint256 reserveFactor, uint256 supplyCap);
    event ReserveAtomicallyEnabled(
        address indexed asset,
        uint256 minATokenSupply,
        bool borrowingEnabled,
        bool stableBorrowingEnabled,
        bool flashLoanEnabled
    );

    /**
     * @notice Initializes new reserves and immediately stages them into a safe non-live posture.
     * @dev The helper must hold both ASSET_LISTING_ADMIN_ROLE (or POOL_ADMIN_ROLE) and RISK_ADMIN_ROLE
     *      on the PoolConfigurator before this function is executed.
     * @param pool The target pool.
     * @param configurator The target pool configurator.
     * @param inputParams New reserve init params plus safe-stage parameters.
     */
    function initAndStageReserves(
        IPool pool,
        IPoolConfigurator configurator,
        InitAndStageReserveInput[] calldata inputParams
    ) external onlyOwner {
        uint256 inputLength = inputParams.length;
        ConfiguratorInputTypes.InitReserveInput[] memory initInputs = new ConfiguratorInputTypes.InitReserveInput[](
            inputLength
        );

        for (uint256 i = 0; i < inputLength; i++) {
            address asset = inputParams[i].underlyingAsset;

            if (pool.getReserveData(asset).aTokenAddress != address(0)) {
                revert ReserveAlreadyInitialized(asset);
            }

            initInputs[i] = ConfiguratorInputTypes.InitReserveInput({
                aTokenImpl: inputParams[i].aTokenImpl,
                stableDebtTokenImpl: inputParams[i].stableDebtTokenImpl,
                variableDebtTokenImpl: inputParams[i].variableDebtTokenImpl,
                underlyingAssetDecimals: inputParams[i].underlyingAssetDecimals,
                interestRateStrategyAddress: inputParams[i].interestRateStrategyAddress,
                underlyingAsset: asset,
                treasury: inputParams[i].treasury,
                incentivesController: inputParams[i].incentivesController,
                aTokenName: inputParams[i].aTokenName,
                aTokenSymbol: inputParams[i].aTokenSymbol,
                variableDebtTokenName: inputParams[i].variableDebtTokenName,
                variableDebtTokenSymbol: inputParams[i].variableDebtTokenSymbol,
                stableDebtTokenName: inputParams[i].stableDebtTokenName,
                stableDebtTokenSymbol: inputParams[i].stableDebtTokenSymbol,
                params: inputParams[i].params
            });
        }

        configurator.initReserves(initInputs);

        for (uint256 i = 0; i < inputLength; i++) {
            StageReserveInput memory stageInput = StageReserveInput({
                asset: inputParams[i].underlyingAsset,
                reserveFactor: inputParams[i].reserveFactor,
                supplyCap: inputParams[i].supplyCap,
                debtCeiling: inputParams[i].debtCeiling
            });

            _stageReserve(pool, configurator, stageInput);
        }
    }

    /**
     * @notice Stages already-initialized reserves into a safe non-live posture.
     * @dev Intended for partially completed rollouts or recovery of interrupted listing flows.
     *      The reserve must not already have supplier liquidity if collateral needs to be disabled.
     * @param pool The target pool.
     * @param configurator The target pool configurator.
     * @param inputParams Per-reserve safe-stage parameters.
     */
    function stageReserves(
        IPool pool,
        IPoolConfigurator configurator,
        StageReserveInput[] calldata inputParams
    ) external onlyOwner {
        for (uint256 i = 0; i < inputParams.length; i++) {
            StageReserveInput memory stageInput = StageReserveInput({
                asset: inputParams[i].asset,
                reserveFactor: inputParams[i].reserveFactor,
                supplyCap: inputParams[i].supplyCap,
                debtCeiling: inputParams[i].debtCeiling
            });
            _stageReserve(pool, configurator, stageInput);
        }
    }

    /**
     * @notice Atomically enables staged reserves only after aToken supply exceeds an explicit floor.
     * @dev The reserve must still be in the staged posture: collateral disabled, borrowing disabled,
     *      stable borrowing disabled, and flash loans disabled.
     * @param pool The target pool.
     * @param configurator The target pool configurator.
     * @param inputParams Final market parameters and seed-supply floors.
     */
    function enableReserves(
        IPool pool,
        IPoolConfigurator configurator,
        EnableReserveInput[] calldata inputParams
    ) external onlyOwner {
        for (uint256 i = 0; i < inputParams.length; i++) {
            EnableReserveInput memory enableInput = EnableReserveInput({
                asset: inputParams[i].asset,
                baseLTV: inputParams[i].baseLTV,
                liquidationThreshold: inputParams[i].liquidationThreshold,
                liquidationBonus: inputParams[i].liquidationBonus,
                reserveFactor: inputParams[i].reserveFactor,
                borrowCap: inputParams[i].borrowCap,
                supplyCap: inputParams[i].supplyCap,
                debtCeiling: inputParams[i].debtCeiling,
                unbackedMintCap: inputParams[i].unbackedMintCap,
                liquidationProtocolFee: inputParams[i].liquidationProtocolFee,
                borrowableInIsolation: inputParams[i].borrowableInIsolation,
                borrowingEnabled: inputParams[i].borrowingEnabled,
                stableBorrowingEnabled: inputParams[i].stableBorrowingEnabled,
                flashLoanEnabled: inputParams[i].flashLoanEnabled,
                minATokenSupply: inputParams[i].minATokenSupply
            });
            _enableReserve(pool, configurator, enableInput);
        }
    }

    function _clearCollateralIfSeedless(IPoolConfigurator configurator, address asset, address aTokenAddress) internal {
        uint256 currentATokenSupply = IAToken(aTokenAddress).totalSupply();
        if (currentATokenSupply != 0) {
            revert ReserveMustBeSeedlessToStage(asset, currentATokenSupply);
        }
        configurator.configureReserveAsCollateral(asset, 0, 0, 0);
    }

    function _stageReserve(IPool pool, IPoolConfigurator configurator, StageReserveInput memory input) internal {
        DataTypes.ReserveData memory reserveData = pool.getReserveData(input.asset);

        if (reserveData.aTokenAddress == address(0)) {
            revert ReserveNotInitialized(input.asset);
        }

        DataTypes.ReserveConfigurationMap memory currentConfig = pool.getConfiguration(input.asset);
        (bool active, bool frozen, bool borrowingEnabled, bool stableBorrowingEnabled, bool paused) = currentConfig
            .getFlags();
        (
            uint256 currentLtv,
            uint256 currentLiquidationThreshold,
            uint256 currentLiquidationBonus,
            ,
            uint256 currentReserveFactor,

        ) = currentConfig.getParams();
        (uint256 currentBorrowCap, uint256 currentSupplyCap) = currentConfig.getCaps();

        if (!active) {
            revert ReserveInactive(input.asset);
        }

        if (paused) {
            revert ReservePaused(input.asset);
        }

        if (currentLtv != 0 || currentLiquidationThreshold != 0 || currentLiquidationBonus != 0) {
            _clearCollateralIfSeedless(configurator, input.asset, reserveData.aTokenAddress);
        }

        if (stableBorrowingEnabled) {
            configurator.setReserveStableRateBorrowing(input.asset, false);
        }

        if (borrowingEnabled) {
            configurator.setReserveBorrowing(input.asset, false);
        }

        if (currentConfig.getFlashLoanEnabled()) {
            configurator.setReserveFlashLoaning(input.asset, false);
        }

        if (currentBorrowCap != 0) {
            configurator.setBorrowCap(input.asset, 0);
        }

        if (currentConfig.getBorrowableInIsolation()) {
            configurator.setBorrowableInIsolation(input.asset, false);
        }

        if (frozen) {
            configurator.setReserveFreeze(input.asset, false);
        }

        if (currentSupplyCap != input.supplyCap) {
            configurator.setSupplyCap(input.asset, input.supplyCap);
        }

        if (currentConfig.getDebtCeiling() != input.debtCeiling) {
            configurator.setDebtCeiling(input.asset, input.debtCeiling);
        }

        if (currentReserveFactor != input.reserveFactor) {
            configurator.setReserveFactor(input.asset, input.reserveFactor);
        }

        emit ReserveStaged(input.asset, input.reserveFactor, input.supplyCap);
    }

    function _enableReserve(IPool pool, IPoolConfigurator configurator, EnableReserveInput memory input) internal {
        if (input.stableBorrowingEnabled && !input.borrowingEnabled) {
            revert StableBorrowingRequiresBorrowing(input.asset);
        }

        if (
            input.minATokenSupply == 0 &&
            (input.baseLTV != 0 || input.liquidationThreshold != 0 || input.borrowingEnabled || input.flashLoanEnabled)
        ) {
            revert MinATokenSupplyRequired(input.asset);
        }

        DataTypes.ReserveData memory reserveData = pool.getReserveData(input.asset);

        if (reserveData.aTokenAddress == address(0)) {
            revert ReserveNotInitialized(input.asset);
        }

        DataTypes.ReserveConfigurationMap memory currentConfig = pool.getConfiguration(input.asset);
        (bool active, bool frozen, bool borrowingEnabled, bool stableBorrowingEnabled, bool paused) = currentConfig
            .getFlags();
        (uint256 currentLtv, uint256 currentLiquidationThreshold, uint256 currentLiquidationBonus, , , ) = currentConfig
            .getParams();

        if (!active) {
            revert ReserveInactive(input.asset);
        }

        if (paused) {
            revert ReservePaused(input.asset);
        }

        if (currentLtv != 0 || currentLiquidationThreshold != 0 || currentLiquidationBonus != 0) {
            revert ReserveCollateralAlreadyEnabled(input.asset);
        }

        if (borrowingEnabled) {
            revert ReserveBorrowingAlreadyEnabled(input.asset);
        }

        if (stableBorrowingEnabled) {
            revert ReserveStableBorrowingAlreadyEnabled(input.asset);
        }

        if (currentConfig.getFlashLoanEnabled()) {
            revert ReserveFlashLoansAlreadyEnabled(input.asset);
        }

        uint256 currentATokenSupply = IAToken(reserveData.aTokenAddress).totalSupply();

        if (currentATokenSupply < input.minATokenSupply) {
            revert InsufficientATokenSupply(input.asset, currentATokenSupply, input.minATokenSupply);
        }

        uint256 currentDebtCeiling = currentConfig.getDebtCeiling();
        if (currentDebtCeiling == 0 && input.debtCeiling != 0 && currentATokenSupply != 0) {
            revert DebtCeilingMustBeStagedBeforeSeeding(
                input.asset,
                currentATokenSupply,
                currentDebtCeiling,
                input.debtCeiling
            );
        }

        if (frozen) {
            configurator.setReserveFreeze(input.asset, false);
        }

        configurator.configureReserveAsCollateral(
            input.asset,
            input.baseLTV,
            input.liquidationThreshold,
            input.liquidationBonus
        );
        configurator.setReserveFactor(input.asset, input.reserveFactor);
        configurator.setSupplyCap(input.asset, input.supplyCap);
        configurator.setBorrowCap(input.asset, input.borrowCap);
        configurator.setBorrowableInIsolation(input.asset, input.borrowableInIsolation);
        configurator.setUnbackedMintCap(input.asset, input.unbackedMintCap);
        configurator.setLiquidationProtocolFee(input.asset, input.liquidationProtocolFee);
        if (currentDebtCeiling != input.debtCeiling) {
            configurator.setDebtCeiling(input.asset, input.debtCeiling);
        }

        if (input.borrowingEnabled) {
            configurator.setReserveBorrowing(input.asset, true);
        }

        if (input.stableBorrowingEnabled) {
            configurator.setReserveStableRateBorrowing(input.asset, true);
        }

        if (input.flashLoanEnabled) {
            configurator.setReserveFlashLoaning(input.asset, true);
        }

        emit ReserveAtomicallyEnabled(
            input.asset,
            input.minATokenSupply,
            input.borrowingEnabled,
            input.stableBorrowingEnabled,
            input.flashLoanEnabled
        );
    }
}
