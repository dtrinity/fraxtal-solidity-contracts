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

import "@openzeppelin/contracts-5/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-5/token/ERC20/extensions/IERC20Metadata.sol";
import "contracts/dusd/AmoManager.sol";
import "contracts/dusd/AmoVault.sol";
import "contracts/curve/interfaces/ICurveRouterNgPoolsOnlyV1.sol";
import "contracts/curve/interfaces/IStableSwapNG.sol";
import "@openzeppelin/contracts-5/utils/structs/EnumerableSet.sol";

/**
 * @title CurveStableSwapNGAmoVault
 * @notice Implementation of AmoVault for Curve StableSwap NG pools
 */
contract CurveStableSwapNGAmoVault is AmoVault {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /* Core state */

    ICurveRouterNgPoolsOnlyV1 public immutable router;
    EnumerableSet.AddressSet private _lpTokens;

    /* Roles */

    bytes32 public constant AMO_TRADER_ROLE = keccak256("AMO_TRADER_ROLE");

    /* Custom Errors */
    error TokenNotAllowedAsCollateral(address token);

    /**
     * @notice Initializes the CurveStableSwapNGAmoVault
     * @param _dusd Address of the dUSD token
     * @param _amoManager Address of the AMO manager
     * @param _oracle Address of the price oracle
     * @param _router Address of the Curve Router NG
     * @param _admin Address of the admin
     * @param _collateralWithdrawer Address allowed to withdraw collateral
     * @param _recoverer Address allowed to recover tokens
     * @param _amoTrader Address allowed to perform AMO trading operations
     */
    constructor(
        address _dusd,
        address _amoManager,
        IPriceOracleGetter _oracle,
        ICurveRouterNgPoolsOnlyV1 _router,
        address _admin,
        address _collateralWithdrawer,
        address _recoverer,
        address _amoTrader
    ) AmoVault(_dusd, _amoManager, _admin, _collateralWithdrawer, _recoverer, _oracle) {
        router = ICurveRouterNgPoolsOnlyV1(_router);

        grantRole(AMO_TRADER_ROLE, _amoTrader);
    }

    /**
     * @dev Calculates the total collateral value of the vault.
     * @return The total collateral value in BASE_CURRENCY_UNIT.
     */
    function totalCollateralValue() public view override returns (uint256) {
        uint256 totalUsdValue = 0;

        // Add the value of all collateral tokens
        address[] memory collateralTokens = listCollateral();
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            address collateralToken = collateralTokens[i];
            uint256 collateralBalance = IERC20(collateralToken).balanceOf(address(this));
            totalUsdValue += _getTokenValue(collateralToken, collateralBalance);
        }

        // Add the collateral value from LP tokens
        (uint256 lpCollateralValue, ) = _totalLpValues();
        totalUsdValue += lpCollateralValue;

        return totalUsdValue;
    }

    /**
     * @notice Calculates the total value of dUSD in the vault
     * @return The total value of dUSD in the vault, denominated in the base value (e.g., USD)
     */
    function totalDusdValue() public view override returns (uint256) {
        uint256 dusdUsdValue = 0;

        // Get the value of dUSD in this contract
        uint256 dusdBalance = dusd.balanceOf(address(this));
        dusdUsdValue += _getTokenValue(address(dusd), dusdBalance);

        // Get the value of dUSD in LP tokens
        (, uint256 lpDusdValue) = _totalLpValues();
        dusdUsdValue += lpDusdValue;

        return dusdUsdValue;
    }

    /**
     * @notice Calculates the total value of the vault
     * @return The total value of the vault, denominated in the base value (e.g., USD)
     */
    function totalValue() public view override returns (uint256) {
        uint256 _totalValue = 0;

        // Add the value of all collateral tokens
        address[] memory collateralTokens = listCollateral();
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            address collateralToken = collateralTokens[i];
            uint256 collateralBalance = IERC20(collateralToken).balanceOf(address(this));
            _totalValue += _getTokenValue(collateralToken, collateralBalance);
        }

        // Add the value of dUSD
        uint256 dusdBalance = dusd.balanceOf(address(this));
        _totalValue += _getTokenValue(address(dusd), dusdBalance);

        // Add the value of LP tokens
        (uint256 lpCollateralValue, uint256 lpDusdValue) = _totalLpValues();
        _totalValue += lpCollateralValue + lpDusdValue;

        return _totalValue;
    }

    /**
     * @dev Helper for allowing multiple collateral tokens.
     * @param tokens An array of token addresses to be added as collateral.
     */
    function allowCollaterals(address[] calldata tokens) external onlyRole(COLLATERAL_MANAGER_ROLE) {
        for (uint256 i = 0; i < tokens.length; i++) {
            super.allowCollateral(tokens[i]);
        }
    }

    /**
     * @dev Helper for disallowing multiple collateral tokens.
     * @param tokens An array of token addresses to be removed from collateral.
     */
    function disallowCollaterals(address[] calldata tokens) external onlyRole(COLLATERAL_MANAGER_ROLE) {
        for (uint256 i = 0; i < tokens.length; i++) {
            super.disallowCollateral(tokens[i]);
        }
    }

    /* Curve Interaction */

    /**
     * @notice Executes a swap with exact input amount on Curve
     * @param route Array of token addresses representing the swap path
     * @param swapParams Array of swap parameters for each hop
     * @param amountIn The exact amount of input tokens to swap
     * @param minAmountOut The minimum amount of output tokens to receive
     * @return uint256 The amount of output tokens received
     */
    function swapExactIn(
        address[11] calldata route,
        uint256[4][5] calldata swapParams,
        uint256 amountIn,
        uint256 minAmountOut
    ) external onlyRole(AMO_TRADER_ROLE) returns (uint256) {
        address tokenIn = route[0];
        IERC20(tokenIn).approve(address(router), amountIn);

        return router.exchange(route, swapParams, amountIn, minAmountOut, address(this));
    }

    /**
     * @notice Gets the expected output amount for a swap with exact input
     * @param route Array of token addresses representing the swap path
     * @param swapParams Array of swap parameters for each hop
     * @param amountIn The amount of input tokens
     * @return uint256 The expected amount of output tokens
     */
    function getExpectedOutput(
        address[11] calldata route,
        uint256[4][5] calldata swapParams,
        uint256 amountIn
    ) external view returns (uint256) {
        return router.get_dy(route, swapParams, amountIn);
    }

    /**
     * @notice Gets the expected input amount for a desired output amount
     * @param route Array of token addresses representing the swap path
     * @param swapParams Array of swap parameters for each hop
     * @param amountOut The desired amount of output tokens
     * @return uint256 The expected amount of input tokens required
     */
    function getExpectedInput(
        address[11] calldata route,
        uint256[4][5] calldata swapParams,
        uint256 amountOut
    ) external view returns (uint256) {
        return router.get_dx(route, swapParams, amountOut);
    }

    /**
     * @dev Adds liquidity to a Curve pool.
     * @param poolAddress The address of the Curve pool
     * @param amounts The amounts of tokens to add as liquidity
     * @param minMintAmount The minimum amount of LP tokens to receive
     * @return The amount of LP tokens received
     */
    function addLiquidity(
        address poolAddress,
        uint256[] calldata amounts,
        uint256 minMintAmount
    ) external onlyRole(AMO_TRADER_ROLE) returns (uint256) {
        ICurveStableSwapNG pool = ICurveStableSwapNG(poolAddress);
        uint256 nCoins = pool.N_COINS();

        // Approve tokens
        for (uint256 i = 0; i < nCoins; i++) {
            address token = pool.coins(i);
            if (amounts[i] > 0) {
                IERC20(token).approve(poolAddress, amounts[i]);
            }
        }

        // Add liquidity to the pool
        uint256 lpTokensReceived = pool.add_liquidity(amounts, minMintAmount);

        // Update position tracking
        // Note that add returns false if the value is already in the set, so it's safe to call it multiple times for the same pool
        _lpTokens.add(poolAddress);

        return lpTokensReceived;
    }

    /**
     * @dev Removes liquidity from a Curve pool.
     * @param poolAddress The address of the Curve pool
     * @param lpTokenAmount The amount of LP tokens to burn
     * @param minAmounts The minimum amounts of tokens to receive
     * @return The amounts of tokens received
     */
    function removeLiquidity(
        address poolAddress,
        uint256 lpTokenAmount,
        uint256[] calldata minAmounts
    ) external onlyRole(AMO_TRADER_ROLE) returns (uint256[] memory) {
        ICurveStableSwapNG pool = ICurveStableSwapNG(poolAddress);

        // Approve LP tokens
        IERC20(poolAddress).approve(poolAddress, lpTokenAmount);

        // Remove liquidity from the pool
        uint256[] memory receivedAmounts = pool.remove_liquidity(lpTokenAmount, minAmounts);

        // Update position tracking
        if (IERC20(poolAddress).balanceOf(address(this)) == 0) {
            _lpTokens.remove(poolAddress);
        }

        return receivedAmounts;
    }

    /**
     * @dev Removes liquidity from a Curve pool in a single coin.
     * @param poolAddress The address of the Curve pool
     * @param lpTokenAmount The amount of LP tokens to burn
     * @param i The index of the coin to receive
     * @param minAmount The minimum amount of tokens to receive
     * @return The amount of tokens received
     */
    function removeLiquidityOneCoin(
        address poolAddress,
        uint256 lpTokenAmount,
        int128 i,
        uint256 minAmount
    ) external onlyRole(AMO_TRADER_ROLE) returns (uint256) {
        ICurveStableSwapNG pool = ICurveStableSwapNG(poolAddress);

        // Approve LP tokens
        IERC20(poolAddress).approve(poolAddress, lpTokenAmount);

        // Remove liquidity from the pool
        uint256 receivedAmount = pool.remove_liquidity_one_coin(lpTokenAmount, i, minAmount);

        // Update position tracking
        if (IERC20(poolAddress).balanceOf(address(this)) == 0) {
            _lpTokens.remove(poolAddress);
        }

        return receivedAmount;
    }

    /**
     * @dev Removes liquidity from a Curve pool imbalanced.
     * @param poolAddress The address of the Curve pool
     * @param amounts The amounts of tokens to withdraw
     * @param maxBurnAmount The maximum amount of LP tokens to burn
     * @return The actual amount of LP tokens burned
     */
    function removeLiquidityImbalance(
        address poolAddress,
        uint256[] calldata amounts,
        uint256 maxBurnAmount
    ) external onlyRole(AMO_TRADER_ROLE) returns (uint256) {
        ICurveStableSwapNG pool = ICurveStableSwapNG(poolAddress);

        // Approve LP tokens
        IERC20(poolAddress).approve(poolAddress, maxBurnAmount);

        // Remove liquidity from the pool
        uint256 burnedAmount = pool.remove_liquidity_imbalance(amounts, maxBurnAmount);

        // Update position tracking
        if (IERC20(poolAddress).balanceOf(address(this)) == 0) {
            _lpTokens.remove(poolAddress);
        }

        return burnedAmount;
    }

    /**
     * @notice Returns the number of LP token positions.
     * @return The number of LP tokens.
     */
    function getLpTokenCount() public view returns (uint256) {
        return _lpTokens.length();
    }

    /**
     * @notice Checks if the given LP token is in the set.
     * @param lpToken The LP token address to check.
     * @return True if the LP token is in the set, false otherwise.
     */
    function hasLpToken(address lpToken) public view returns (bool) {
        return _lpTokens.contains(lpToken);
    }

    /**
     * @notice Returns a list of all LP token addresses.
     * @return An array of all LP token addresses.
     */
    function getAllLpTokens() public view returns (address[] memory) {
        return _lpTokens.values();
    }

    /**
     * @dev Calculates the value of an LP excluding dUSD.
     * @param lpToken The address of the LP token.
     * @return collateralValue The value of the collateral in BASE_CURRENCY_UNIT
     * @return dusdValue The value of the dUSD in BASE_CURRENCY_UNIT
     */
    function _getLpValues(address lpToken) internal view returns (uint256 collateralValue, uint256 dusdValue) {
        ICurveStableSwapNG pool = ICurveStableSwapNG(lpToken);
        uint256 myLpBalance = IERC20(lpToken).balanceOf(address(this));
        uint256 totalLpSupply = IERC20(lpToken).totalSupply();

        uint256 nCoins = pool.N_COINS();
        for (uint256 i = 0; i < nCoins; i++) {
            address token = pool.coins(i);
            uint256 poolTokenBalance = pool.balances(i);
            uint256 myTokenShare = (poolTokenBalance * myLpBalance) / totalLpSupply;
            uint256 tokenValue = _getTokenValue(token, myTokenShare);
            if (token == address(dusd)) {
                dusdValue += tokenValue;
            } else {
                collateralValue += tokenValue;
            }
        }

        return (collateralValue, dusdValue);
    }

    /**
     * @dev Gets the value of a token in BASE_CURRENCY_UNIT
     * @param token The address of the token
     * @param amount The amount of tokens
     * @return The value of the tokens in BASE_CURRENCY_UNIT
     */
    function _getTokenValue(address token, uint256 amount) internal view returns (uint256) {
        uint256 price = oracle.getAssetPrice(token);
        uint256 decimals = IERC20Metadata(token).decimals();

        return (amount * price) / (10 ** decimals);
    }

    /**
     * @dev Calculates the total values across all LP positions
     * @return _totalCollateralValue The sum of all non-dUSD token values in BASE_CURRENCY_UNIT
     * @return _totalDusdValue The sum of all dUSD values in BASE_CURRENCY_UNIT
     */
    function _totalLpValues() internal view returns (uint256 _totalCollateralValue, uint256 _totalDusdValue) {
        uint256 lpTokenCount = _lpTokens.length();
        for (uint256 i = 0; i < lpTokenCount; i++) {
            address lpToken = _lpTokens.at(i);
            (uint256 collateralValue, uint256 dusdValue) = _getLpValues(lpToken);
            _totalCollateralValue += collateralValue;
            _totalDusdValue += dusdValue;
        }
        return (_totalCollateralValue, _totalDusdValue);
    }
}
