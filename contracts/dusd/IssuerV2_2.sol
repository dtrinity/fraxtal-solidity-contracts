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

import "contracts/lending/core/interfaces/IPriceOracleGetter.sol";
import "contracts/token/IERC20Stablecoin.sol";
import "./CollateralVault.sol";
import "./OracleAware.sol";

/**
 * @title IssuerV2_2
 * @notice Issuer responsible for minting dUSD tokens with asset-level controls and collateral backing checks
 */
contract IssuerV2_2 is AccessControl, OracleAware, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20Metadata;

    /* Core state */

    IERC20Stablecoin public dusd;
    uint8 public immutable dusdDecimals;
    CollateralVault public collateralVault;

    /* Events */

    event CollateralVaultSet(address indexed collateralVault);
    event AssetMintingPauseUpdated(address indexed asset, bool paused);
    event AssetDepositCapUpdated(address indexed asset, uint256 cap);

    /* Roles */

    bytes32 public constant INCENTIVES_MANAGER_ROLE = keccak256("INCENTIVES_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /* Errors */

    error SlippageTooHigh(uint256 minDUsd, uint256 dusdAmount);
    error IssuanceSurpassesCollateral(uint256 collateralInDusd, uint256 totalDusd);
    error AssetMintingPaused(address asset);
    error CannotBeZeroAddress();
    error AssetDepositCapExceeded(address asset, uint256 cap, uint256 projectedBalance);

    /* Overrides */

    // If true, minting with this collateral asset is paused at the issuer level
    mapping(address => bool) public assetMintingPaused;
    // Maximum amount of each asset that can be deposited via the issuer (0 = no cap)
    mapping(address => uint256) public assetDepositCap;

    /**
     * @notice Initializes the IssuerV2_2 contract with core dependencies
     * @param _collateralVault The address of the collateral vault
     * @param _dusd The address of the dUSD stablecoin
     * @param oracle The address of the price oracle
     */
    constructor(
        address _collateralVault,
        address _dusd,
        IPriceOracleGetter oracle
    ) OracleAware(_requireOracle(oracle), _requireOracleBaseCurrencyUnit(oracle)) {
        if (_collateralVault == address(0) || _dusd == address(0)) {
            revert CannotBeZeroAddress();
        }

        collateralVault = CollateralVault(_collateralVault);
        dusd = IERC20Stablecoin(_dusd);
        dusdDecimals = dusd.decimals();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        grantRole(INCENTIVES_MANAGER_ROLE, msg.sender);
        grantRole(PAUSER_ROLE, msg.sender);
    }

    /* Issuer */

    /**
     * @notice Issues dUSD tokens in exchange for collateral from the caller
     * @param collateralAmount The amount of collateral to deposit
     * @param collateralAsset The address of the collateral asset being deposited
     * @param minDUsd The minimum amount of dUSD the caller expects (slippage guard)
     */
    function issue(
        uint256 collateralAmount,
        address collateralAsset,
        uint256 minDUsd
    ) external whenNotPaused nonReentrant {
        if (!isAssetMintingEnabled(collateralAsset)) {
            revert AssetMintingPaused(collateralAsset);
        }

        uint256 cap = assetDepositCap[collateralAsset];
        if (cap > 0) {
            uint256 projectedBalance = IERC20Metadata(collateralAsset).balanceOf(address(collateralVault)) +
                collateralAmount;
            if (projectedBalance > cap) {
                revert AssetDepositCapExceeded(collateralAsset, cap, projectedBalance);
            }
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
        IERC20Metadata(collateralAsset).safeTransferFrom(msg.sender, address(collateralVault), collateralAmount);

        // Ensure post-mint total supply remains backed by collateral value
        uint256 postSupply = dusd.totalSupply() + dusdAmount;
        uint256 collateralCover = collateralInDusd();
        if (collateralCover < postSupply) {
            revert IssuanceSurpassesCollateral(collateralCover, postSupply);
        }

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

        uint256 totalSupply = dusd.totalSupply();
        uint256 collateralCover = collateralInDusd();
        if (collateralCover < totalSupply) {
            revert IssuanceSurpassesCollateral(collateralCover, totalSupply);
        }
    }

    /**
     * @notice Calculates the collateral value in dUSD tokens
     * @return The amount of dUSD tokens equivalent to the collateral value
     */
    function collateralInDusd() public view returns (uint256) {
        uint256 collateralInBase = collateralVault.totalValue();
        return baseValueToDusdAmount(collateralInBase);
    }

    /**
     * @notice Converts a base value to an equivalent amount of dUSD tokens
     * @param baseValue The amount of base value to convert
     * @return The equivalent amount of dUSD tokens
     */
    function baseValueToDusdAmount(uint256 baseValue) public view returns (uint256) {
        return Math.mulDiv(baseValue, 10 ** dusdDecimals, baseCurrencyUnit);
    }

    /**
     * @notice Returns whether `asset` is currently enabled for minting by the issuer
     * @dev Asset must be supported by the collateral vault and not paused by issuer
     */
    function isAssetMintingEnabled(address asset) public view returns (bool) {
        if (!collateralVault.isCollateralSupported(asset)) {
            return false;
        }
        return !assetMintingPaused[asset];
    }

    /* Admin */

    /**
     * @notice Sets the collateral vault address
     * @param _collateralVault The address of the collateral vault
     */
    function setCollateralVault(address _collateralVault) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_collateralVault == address(0)) {
            revert CannotBeZeroAddress();
        }
        collateralVault = CollateralVault(_collateralVault);
        emit CollateralVaultSet(_collateralVault);
    }

    /**
     * @notice Set minting pause override for a specific collateral asset
     * @param asset The collateral asset address
     * @param paused True to pause minting; false to enable
     */
    function setAssetMintingPause(address asset, bool paused) external onlyRole(PAUSER_ROLE) {
        if (!collateralVault.isCollateralSupported(asset)) {
            revert CollateralVault.UnsupportedCollateral(asset);
        }
        assetMintingPaused[asset] = paused;
        emit AssetMintingPauseUpdated(asset, paused);
    }

    /**
     * @notice Sets the deposit cap for a collateral asset
     * @dev Cap is denominated in the asset's native decimals; a value of 0 removes the cap
     * @param asset The collateral asset address
     * @param cap The maximum allowable balance for this asset at the collateral vault
     */
    function setAssetDepositCap(address asset, uint256 cap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!collateralVault.isCollateralSupported(asset)) {
            revert CollateralVault.UnsupportedCollateral(asset);
        }
        assetDepositCap[asset] = cap;
        emit AssetDepositCapUpdated(asset, cap);
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

    function _requireOracle(IPriceOracleGetter oracle) private pure returns (IPriceOracleGetter) {
        if (address(oracle) == address(0)) {
            revert CannotBeZeroAddress();
        }

        return oracle;
    }

    function _requireOracleBaseCurrencyUnit(IPriceOracleGetter oracle) private view returns (uint256) {
        if (address(oracle) == address(0)) {
            revert CannotBeZeroAddress();
        }

        return oracle.BASE_CURRENCY_UNIT();
    }
}
