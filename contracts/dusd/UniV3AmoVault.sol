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
import "contracts/dex/core/interfaces/IUniswapV3Pool.sol"; // Keep this import since it is compatible with current solidity version
import "contracts/dusd/dependencies/uniswap-v3/core/libraries/TickMath.sol";
import "contracts/dusd/dependencies/uniswap-v3/periphery/libraries/LiquidityAmounts.sol";
import "contracts/dusd/dependencies/uniswap-v3/periphery/interfaces/INonfungiblePositionManager.sol";
import "contracts/dusd/dependencies/uniswap-v3/periphery/interfaces/ISwapRouter.sol";
import "contracts/dusd/dependencies/uniswap-v3/core/libraries/TransferHelper.sol";
import "contracts/dusd/AmoManager.sol";
import "contracts/dusd/AmoVault.sol";
import "contracts/shared/Constants.sol";

contract UniV3AmoVault is AmoVault {
    /* Core state */

    IUniswapV3Pool public immutable pool;
    INonfungiblePositionManager public immutable positions;
    ISwapRouter public immutable router;

    IERC20 public immutable token0;
    IERC20 public immutable token1;
    bool public immutable dusdIsToken0;
    IERC20 public immutable collateralToken;
    uint8 private immutable collateralDecimals;

    uint256 public swapDeadlineBuffer = 240; // 4 minutes in seconds

    /* Roles */

    bytes32 public constant AMO_TRADER_ROLE = keccak256("AMO_TRADER_ROLE");

    struct Position {
        uint256 tokenId;
        address collateral;
        uint128 liquidity;
        int24 tickLower;
        int24 tickUpper;
    }
    Position[] private _positionsArray;
    mapping(uint256 => Position) private _positionsMapping;

    /* Errors */
    error IndexOutOfBounds(uint256 index, uint256 length);
    error PositionDoesNotExist(uint256 tokenId);
    error DusdMustBeOneOfThePoolTokens();

    constructor(
        address _dusd,
        address _amoManager,
        IPriceOracleGetter _oracle,
        address _pool,
        address _positions,
        address _router,
        address _admin,
        address _collateralWithdrawer,
        address _recoverer,
        address _amoTrader
    )
        AmoVault(
            _dusd,
            _amoManager,
            _admin,
            _collateralWithdrawer,
            _recoverer,
            _oracle
        )
    {
        pool = IUniswapV3Pool(_pool);
        token0 = IERC20(pool.token0());
        token1 = IERC20(pool.token1());
        dusdIsToken0 = address(dusd) == address(token0);
        collateralToken = dusdIsToken0 ? token1 : token0;
        collateralDecimals = IERC20Metadata(address(collateralToken))
            .decimals();

        if (!(dusdIsToken0 || address(dusd) == address(token1))) {
            revert DusdMustBeOneOfThePoolTokens();
        }

        positions = INonfungiblePositionManager(_positions);
        router = ISwapRouter(_router);

        grantRole(AMO_TRADER_ROLE, _amoTrader);

        // Add the primary collateral token to the supported collateral list
        allowCollateral(address(collateralToken));
    }

    /**
     * @dev Calculates the total collateral value of the vault.
     * @return The total collateral value in BASE_CURRENCY_UNIT.
     */
    function totalCollateralValue() public view override returns (uint256) {
        // Get the total value of all held collaterals
        uint256 collateralBalance = collateralToken.balanceOf(address(this));
        uint256 collateralBalanceValue = (collateralBalance *
            oracle.getAssetPrice(address(collateralToken))) /
            (10 ** collateralDecimals);

        // Add the value from positions
        (uint256 positionsCollateralValue, ) = _totalPositionValues();

        return collateralBalanceValue + positionsCollateralValue;
    }

    /**
     * @dev Calculates the total value of dUSD in the vault.
     * @return The total value of dUSD in BASE_CURRENCY_UNIT.
     */
    function totalDusdValue() public view override returns (uint256) {
        // Get dUSD balance
        uint256 dusdBalance = dusd.balanceOf(address(this));
        uint256 dusdBalanceValue = (dusdBalance *
            oracle.getAssetPrice(address(dusd))) / (10 ** dusdDecimals);

        // Get dUSD value from positions
        (, uint256 positionsDusdValue) = _totalPositionValues();

        return dusdBalanceValue + positionsDusdValue;
    }

    /**
     * @dev Calculates the total value of the vault.
     * @return The total value of the vault in BASE_CURRENCY_UNIT.
     */
    function totalValue() public view override returns (uint256) {
        // TODO refactor to make more efficient
        return totalCollateralValue() + totalDusdValue();
    }

    /**
     * @notice Calculates the total values of collateral and DUSD across all UniV3 positions
     * @dev Internal helper function used by totalCollateralValue() and totalDusdValue()
     * @return _totalCollateralValue The sum of all non-DUSD token values in BASE_CURRENCY_UNIT
     * @return _totalDusdValue The sum of all DUSD values in BASE_CURRENCY_UNIT
     */
    function _totalPositionValues()
        internal
        view
        returns (uint256 _totalCollateralValue, uint256 _totalDusdValue)
    {
        for (uint i = 0; i < _positionsArray.length; i++) {
            (uint256 collateralValue, uint256 dusdValue) = _getPositionValues(
                _positionsArray[i]
            );
            _totalCollateralValue += collateralValue;
            _totalDusdValue += dusdValue;
        }
        return (_totalCollateralValue, _totalDusdValue);
    }

    /**
     * @notice Gets the current value of a specific UniV3 liquidity position
     * @param position The position struct containing tokenId and liquidity details
     * @return collateralValue The value of non-DUSD tokens in BASE_CURRENCY_UNIT
     * @return dusdValue The value of DUSD in BASE_CURRENCY_UNIT
     */
    function _getPositionValues(
        Position memory position
    ) internal view returns (uint256 collateralValue, uint256 dusdValue) {
        uint160 sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(position.tickLower);
        uint160 sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(position.tickUpper);
        // Get the current price
        (uint160 sqrtPriceX96, , , , , , ) = pool.slot0();

        uint256 amount0 = LiquidityAmounts.getAmount0ForLiquidity(
            sqrtPriceX96,
            sqrtRatioBX96,
            position.liquidity
        );
        uint256 amount1 = LiquidityAmounts.getAmount1ForLiquidity(
            sqrtRatioAX96,
            sqrtPriceX96,
            position.liquidity
        );

        // Split values between DUSD and collateral
        if (dusdIsToken0) {
            dusdValue = amount0;
            collateralValue =
                (amount1 * oracle.getAssetPrice(position.collateral)) /
                (10 ** collateralDecimals);
        } else {
            dusdValue = amount1;
            collateralValue =
                (amount0 * oracle.getAssetPrice(position.collateral)) /
                (10 ** collateralDecimals);
        }

        // Convert DUSD to BASE_CURRENCY_UNIT
        dusdValue =
            (dusdValue * oracle.getAssetPrice(address(dusd))) /
            (10 ** dusdDecimals);

        return (collateralValue, dusdValue);
    }

    /**
     * @notice Creates a new liquidity position in the Uniswap V3 pool
     * @param params The parameters for minting a new position
     * @return tokenId The ID of the newly minted position
     * @return liquidity The amount of liquidity added to the position
     * @return amount0 The amount of token0 added to the position
     * @return amount1 The amount of token1 added to the position
     */
    function mint(
        INonfungiblePositionManager.MintParams calldata params
    )
        external
        onlyRole(AMO_TRADER_ROLE)
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        if (params.amount0Desired == 0 || params.amount1Desired == 0) {
            revert("Both amounts must be non-zero");
        }

        // Approvals
        TransferHelper.safeApprove(
            address(token0),
            address(positions),
            params.amount0Desired
        );
        TransferHelper.safeApprove(
            address(token1),
            address(positions),
            params.amount1Desired
        );

        (tokenId, liquidity, amount0, amount1) = positions.mint(params);

        Position memory newPosition = Position({
            tokenId: tokenId,
            collateral: address(collateralToken),
            liquidity: liquidity,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper
        });

        _positionsArray.push(newPosition);
        _positionsMapping[tokenId] = newPosition;

        return (tokenId, liquidity, amount0, amount1);
    }

    /**
     * @notice Removes liquidity from a position and burns the NFT
     * @dev Collects any accumulated fees before burning.
     * @param tokenId The ID of the position to burn
     */
    function burn(uint256 tokenId) external onlyRole(AMO_TRADER_ROLE) {
        if (_positionsMapping[tokenId].tokenId == 0) {
            revert PositionDoesNotExist(tokenId);
        }

        // First, remove all liquidity
        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: _positionsMapping[tokenId].liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp + swapDeadlineBuffer
                });

        positions.decreaseLiquidity(params);

        // Then, collect all fees
        collectFees(tokenId);

        // Finally, burn the position
        positions.burn(tokenId);

        // Remove from our tracking
        for (uint i = 0; i < _positionsArray.length; i++) {
            if (_positionsArray[i].tokenId == tokenId) {
                _positionsArray[i] = _positionsArray[
                    _positionsArray.length - 1
                ];
                _positionsArray.pop();
                break;
            }
        }
        delete _positionsMapping[tokenId];
    }

    /**
     * @notice Adds liquidity to an existing position
     * @param params The parameters for increasing liquidity
     * @return liquidity The amount of liquidity added to the position
     * @return amount0 The amount of token0 added to the position
     * @return amount1 The amount of token1 added to the position
     */
    function increaseLiquidity(
        INonfungiblePositionManager.IncreaseLiquidityParams calldata params
    )
        external
        onlyRole(AMO_TRADER_ROLE)
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        // Approvals
        if (params.amount0Desired > 0) {
            TransferHelper.safeApprove(
                address(token0),
                address(positions),
                params.amount0Desired
            );
        }

        if (params.amount1Desired > 0) {
            TransferHelper.safeApprove(
                address(token1),
                address(positions),
                params.amount1Desired
            );
        }

        (liquidity, amount0, amount1) = positions.increaseLiquidity(params);

        for (uint i = 0; i < _positionsArray.length; i++) {
            if (_positionsArray[i].tokenId == params.tokenId) {
                _positionsArray[i].liquidity += liquidity;
                break;
            }
        }

        return (liquidity, amount0, amount1);
    }

    /**
     * @notice Removes liquidity from an existing position
     * @param tokenId The ID of the position to decrease liquidity from
     * @param liquidity The amount of liquidity to remove
     * @return amount0 The amount of token0 removed from the position
     * @return amount1 The amount of token1 removed from the position
     */
    function decreaseLiquidity(
        uint256 tokenId,
        uint128 liquidity
    )
        external
        onlyRole(AMO_TRADER_ROLE)
        returns (uint256 amount0, uint256 amount1)
    {
        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp + swapDeadlineBuffer
                });

        (amount0, amount1) = positions.decreaseLiquidity(params);

        for (uint i = 0; i < _positionsArray.length; i++) {
            if (_positionsArray[i].tokenId == params.tokenId) {
                _positionsArray[i].liquidity -= liquidity;
                break;
            }
        }

        return (amount0, amount1);
    }

    /**
     * @dev Collects fees from a position in the Uniswap V3 pool.
     * @param tokenId The ID of the position to collect fees from.
     * @return amount0 The amount of token0 collected as fees.
     * @return amount1 The amount of token1 collected as fees.
     */
    function collectFees(
        uint256 tokenId
    )
        public
        onlyRole(AMO_TRADER_ROLE)
        returns (uint256 amount0, uint256 amount1)
    {
        if (_positionsMapping[tokenId].tokenId == 0) {
            revert PositionDoesNotExist(tokenId);
        }

        INonfungiblePositionManager.CollectParams
            memory params = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (amount0, amount1) = positions.collect(params);

        return (amount0, amount1);
    }

    /**
     * @dev Swaps a token for an exact amount of another token.
     * @param params The parameters for the swap.
     * @return amountIn The amount of input token spent.
     */
    function swapExactOutputSingle(
        ISwapRouter.ExactOutputSingleParams memory params
    ) external onlyRole(AMO_TRADER_ROLE) returns (uint256 amountIn) {
        TransferHelper.safeApprove(
            address(params.tokenIn),
            address(router),
            params.amountInMaximum
        );
        return router.exactOutputSingle(params);
    }

    /**
     * @dev Swaps an exact amount of a token for another token.
     * @param params The parameters for the swap.
     * @return amountOut The amount of output token received.
     */
    function swapExactInputSingle(
        ISwapRouter.ExactInputSingleParams memory params
    ) external onlyRole(AMO_TRADER_ROLE) returns (uint256 amountOut) {
        TransferHelper.safeApprove(
            address(params.tokenIn),
            address(router),
            params.amountIn
        );
        return router.exactInputSingle(params);
    }

    /**
     * @notice Returns the position at the given index.
     * @param index The index of the position to return.
     * @return The position at the given index.
     */
    function getPosition(uint256 index) public view returns (Position memory) {
        if (index >= _positionsArray.length) {
            revert IndexOutOfBounds(index, _positionsArray.length);
        }
        return _positionsArray[index];
    }

    /**
     * @notice Returns the number of positions.
     * @return The number of positions.
     */
    function getPositionsCount() public view returns (uint256) {
        return _positionsArray.length;
    }

    /**
     * @notice Returns the position for the given token ID.
     * @param tokenId The token ID of the position to return.
     * @return The position for the given token ID.
     */
    function getPositionByTokenId(
        uint256 tokenId
    ) public view returns (Position memory) {
        if (_positionsMapping[tokenId].tokenId == 0) {
            revert PositionDoesNotExist(tokenId);
        }
        return _positionsMapping[tokenId];
    }

    /**
     * @notice Updates the swap deadline buffer
     * @param newBuffer New buffer in seconds
     */
    function setSwapDeadlineBuffer(
        uint256 newBuffer
    ) external onlyRole(AMO_TRADER_ROLE) {
        swapDeadlineBuffer = newBuffer;
    }
}
