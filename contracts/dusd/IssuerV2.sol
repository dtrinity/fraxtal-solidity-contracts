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

pragma solidity ^0.8.20;

import "@openzeppelin/contracts-5/access/AccessControl.sol";
import "@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-5/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-5/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-5/utils/Pausable.sol";
import "@openzeppelin/contracts-5/utils/math/Math.sol";

import "contracts/lending/core/interfaces/IAaveOracle.sol";
import "contracts/token/IERC20Stablecoin.sol";
import "./CollateralVault.sol";
import "./AmoManager.sol";
import "./OracleAware.sol";

/**
 * @title IssuerV2
 * @notice Extended issuer responsible for issuing dUSD tokens with asset-level minting overrides and global pause
 */
contract IssuerV2 is AccessControl, OracleAware, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20Metadata;

    /* Core state */

    IERC20Stablecoin public dusd;
    uint8 public immutable dusdDecimals;
    CollateralVault public collateralVault;
    AmoManager public amoManager;

    /* Events */

    event CollateralVaultSet(address indexed collateralVault);
    event AmoManagerSet(address indexed amoManager);
    event AssetMintingPauseUpdated(address indexed asset, bool paused);

    /* Roles */

    bytes32 public constant AMO_MANAGER_ROLE = keccak256("AMO_MANAGER_ROLE");
    bytes32 public constant INCENTIVES_MANAGER_ROLE =
        keccak256("INCENTIVES_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /* Errors */

    error SlippageTooHigh(uint256 minDUsd, uint256 dusdAmount);
    error IssuanceSurpassesExcessCollateral(
        uint256 collateralInDusd,
        uint256 circulatingDusd
    );
    error MintingToAmoShouldNotIncreaseSupply(
        uint256 circulatingDusdBefore,
        uint256 circulatingDusdAfter
    );
    error AssetMintingPaused(address asset);

    /* Overrides */

    // If true, minting with this collateral asset is paused at the issuer level
    mapping(address => bool) public assetMintingPaused;

    /**
     * @notice Initializes the IssuerV2 contract with core dependencies
     * @param _collateralVault The address of the collateral vault
     * @param _dusd The address of the dUSD stablecoin
     * @param oracle The address of the price oracle
     * @param _amoManager The address of the AMO Manager
     */
    constructor(
        address _collateralVault,
        address _dusd,
        IPriceOracleGetter oracle,
        address _amoManager
    ) OracleAware(oracle, oracle.BASE_CURRENCY_UNIT()) {
        collateralVault = CollateralVault(_collateralVault);
        dusd = IERC20Stablecoin(_dusd);
        dusdDecimals = dusd.decimals();
        amoManager = AmoManager(_amoManager);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(AMO_MANAGER_ROLE, msg.sender);
        grantRole(INCENTIVES_MANAGER_ROLE, msg.sender);
        grantRole(PAUSER_ROLE, msg.sender);
    }

    /* Issuer */

    /**
     * @notice Issues dUSD tokens in exchange for collateral from the caller
     * @param collateralAmount The amount of collateral to deposit
     * @param collateralAsset The address of the collateral asset
     * @param minDUsd The minimum amount of dUSD to receive, used for slippage protection
     */
    function issue(
        uint256 collateralAmount,
        address collateralAsset,
        uint256 minDUsd
    ) external nonReentrant whenNotPaused {
        // Ensure the collateral asset is supported by the vault before any further processing
        if (!collateralVault.isCollateralSupported(collateralAsset)) {
            revert CollateralVault.UnsupportedCollateral(collateralAsset);
        }

        // Ensure the issuer has not paused this asset for minting
        if (assetMintingPaused[collateralAsset]) {
            revert AssetMintingPaused(collateralAsset);
        }

        uint8 collateralDecimals = IERC20Metadata(collateralAsset).decimals();
        uint256 baseValue = Math.mulDiv(
            oracle.getAssetPrice(collateralAsset),
            collateralAmount,
            10 ** collateralDecimals
        );
        uint256 dusdAmount = baseValueToDusdAmount(baseValue);
        if (dusdAmount < minDUsd) {
            revert SlippageTooHigh(minDUsd, dusdAmount);
        }

        // Transfer collateral directly to vault
        IERC20Metadata(collateralAsset).safeTransferFrom(
            msg.sender,
            address(collateralVault),
            collateralAmount
        );

        dusd.mint(msg.sender, dusdAmount);
    }

    /**
     * @notice Issues dUSD tokens using excess collateral in the system
     * @param receiver The address to receive the minted dUSD tokens
     * @param dusdAmount The amount of dUSD to mint
     */
    function issueUsingExcessCollateral(
        address receiver,
        uint256 dusdAmount
    ) external onlyRole(INCENTIVES_MANAGER_ROLE) whenNotPaused {
        dusd.mint(receiver, dusdAmount);

        // We don't use the buffer value here because we only mint up to the excess collateral
        uint256 _circulatingDusd = circulatingDusd();
        uint256 _collateralInDusd = collateralInDusd();
        if (_collateralInDusd < _circulatingDusd) {
            revert IssuanceSurpassesExcessCollateral(
                _collateralInDusd,
                _circulatingDusd
            );
        }
    }

    /**
     * @notice Increases the AMO supply by minting new dUSD tokens
     * @param dusdAmount The amount of dUSD to mint and send to the AMO Manager
     */
    function increaseAmoSupply(
        uint256 dusdAmount
    ) external onlyRole(AMO_MANAGER_ROLE) whenNotPaused {
        uint256 _circulatingDusdBefore = circulatingDusd();

        dusd.mint(address(amoManager), dusdAmount);

        uint256 _circulatingDusdAfter = circulatingDusd();

        // Sanity check that we are sending to the active AMO Manager
        if (_circulatingDusdAfter != _circulatingDusdBefore) {
            revert MintingToAmoShouldNotIncreaseSupply(
                _circulatingDusdBefore,
                _circulatingDusdAfter
            );
        }
    }

    /**
     * @notice Calculates the circulating supply of dUSD tokens
     * @return The amount of dUSD tokens that are not held by the AMO Manager
     */
    function circulatingDusd() public view returns (uint256) {
        uint256 totalDusd = dusd.totalSupply();
        uint256 amoDusd = amoManager.totalAmoSupply();
        return totalDusd - amoDusd;
    }

    /**
     * @notice Calculates the collateral value in dUSD tokens
     * @return The amount of dUSD tokens equivalent to the collateral value
     */
    function collateralInDusd() public view returns (uint256) {
        uint256 _collateralInBase = collateralVault.totalValue();
        return baseValueToDusdAmount(_collateralInBase);
    }

    /**
     * @notice Converts a base value to an equivalent amount of dUSD tokens
     * @param baseValue The amount of base value to convert
     * @return The equivalent amount of dUSD tokens
     */
    function baseValueToDusdAmount(
        uint256 baseValue
    ) public view returns (uint256) {
        return Math.mulDiv(baseValue, 10 ** dusdDecimals, baseCurrencyUnit);
    }

    /**
     * @notice Returns whether `asset` is currently enabled for minting by the issuer
     * @dev Asset must be supported by the collateral vault and not paused by issuer
     */
    function isAssetMintingEnabled(address asset) public view returns (bool) {
        if (!collateralVault.isCollateralSupported(asset)) return false;
        return !assetMintingPaused[asset];
    }

    /* Admin */

    /**
     * @notice Sets the AMO Manager address
     * @param _amoManager The address of the AMO Manager
     */
    function setAmoManager(
        address _amoManager
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = address(amoManager);
        amoManager = AmoManager(_amoManager);
        grantRole(AMO_MANAGER_ROLE, _amoManager);
        if (old != address(0) && old != _amoManager) {
            revokeRole(AMO_MANAGER_ROLE, old);
        }
        emit AmoManagerSet(_amoManager);
    }

    /**
     * @notice Sets the collateral vault address
     * @param _collateralVault The address of the collateral vault
     */
    function setCollateralVault(
        address _collateralVault
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        collateralVault = CollateralVault(_collateralVault);
        emit CollateralVaultSet(_collateralVault);
    }

    /**
     * @notice Set minting pause override for a specific collateral asset
     * @param asset The collateral asset address
     * @param paused True to pause minting; false to enable
     */
    function setAssetMintingPause(
        address asset,
        bool paused
    ) external onlyRole(PAUSER_ROLE) {
        // Optional guard: if vault does not support the asset, setting an override is meaningless
        if (!collateralVault.isCollateralSupported(asset)) {
            revert CollateralVault.UnsupportedCollateral(asset);
        }
        assetMintingPaused[asset] = paused;
        emit AssetMintingPauseUpdated(asset, paused);
    }

    /**
     * @notice Pause all minting operations
     */
    function pauseMinting() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause all minting operations
     */
    function unpauseMinting() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}