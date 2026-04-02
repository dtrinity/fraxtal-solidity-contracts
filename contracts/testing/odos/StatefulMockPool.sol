// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "contracts/lending/core/dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "contracts/lending/core/dependencies/openzeppelin/contracts/SafeERC20.sol";
import {DataTypes} from "contracts/lending/core/protocol/libraries/types/DataTypes.sol";

interface IAToken {
    function mint(address user, uint256 amount, uint256 index) external returns (bool);
    function burn(address from, address receiverOfUnderlying, uint256 amount, uint256 index) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address user) external view returns (uint256);
}

/**
 * @title StatefulMockPool
 * @notice Stateful mock pool for testing Odos exploit
 * @dev Implements minimal Aave V3 Pool interface needed for exploit reproduction
 */
contract StatefulMockPool {
    using SafeERC20 for IERC20;

    mapping(address => DataTypes.ReserveData) private reserves;
    address[] private reservesList;

    error PoolBalanceInsufficient(address asset, uint256 balance, uint256 required);

    // Flash loan premium: 0.05% (5 basis points) to match Fraxtal production
    uint256 public constant FLASHLOAN_PREMIUM_TOTAL = 5;
    uint256 public constant FLASHLOAN_PREMIUM_TO_PROTOCOL = 0;

    event Supply(
        address indexed reserve,
        address user,
        address indexed onBehalfOf,
        uint256 amount,
        uint16 indexed referralCode
    );

    event Withdraw(
        address indexed reserve,
        address indexed user,
        address indexed to,
        uint256 amount
    );

    event FlashLoanExecuted(
        address indexed target,
        address indexed initiator,
        address indexed asset,
        uint256 amount,
        uint8 interestRateMode,
        uint256 premium,
        uint16 referralCode
    );

    /**
     * @notice Set reserve data for testing
     */
    function setReserveData(
        address asset,
        address aToken,
        address stableDebtToken,
        address variableDebtToken
    ) external {
        // Only add to list if it's a new reserve
        bool exists = false;
        for (uint256 i = 0; i < reservesList.length; i++) {
            if (reservesList[i] == asset) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            reservesList.push(asset);
        }

        DataTypes.ReserveData memory newReserve = DataTypes.ReserveData({
            configuration: DataTypes.ReserveConfigurationMap(0),
            liquidityIndex: 1e27,
            currentLiquidityRate: 0,
            variableBorrowIndex: 1e27,
            currentVariableBorrowRate: 0,
            currentStableBorrowRate: 0,
            lastUpdateTimestamp: uint40(block.timestamp),
            id: 0,
            aTokenAddress: aToken,
            stableDebtTokenAddress: stableDebtToken,
            variableDebtTokenAddress: variableDebtToken,
            interestRateStrategyAddress: address(0),
            accruedToTreasury: 0,
            unbacked: 0,
            isolationModeTotalDebt: 0
        });
        reserves[asset] = newReserve;
    }

    /**
     * @notice Get list of all reserves
     */
    function getReservesList() external view returns (address[] memory) {
        return reservesList;
    }

    /**
     * @notice Get reserve data
     */
    function getReserveData(
        address asset
    ) external view returns (DataTypes.ReserveData memory) {
        return reserves[asset];
    }

    /**
     * @notice Supply assets to the pool
     */
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external {
        DataTypes.ReserveData memory reserve = reserves[asset];
        require(reserve.aTokenAddress != address(0), "Reserve not initialized");

        // Transfer underlying asset from user to pool
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // Mint aTokens to user (1:1 for simplicity in mock)
        IAToken(reserve.aTokenAddress).mint(onBehalfOf, amount, 1e27);

        emit Supply(asset, msg.sender, onBehalfOf, amount, referralCode);
    }

    /**
     * @notice Withdraw assets from the pool
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256) {
        DataTypes.ReserveData memory reserve = reserves[asset];
        require(reserve.aTokenAddress != address(0), "Reserve not initialized");

        // Burn aTokens from user
        IAToken(reserve.aTokenAddress).burn(msg.sender, to, amount, 1e27);

        // Transfer underlying asset from pool to recipient
        uint256 poolBalance = IERC20(asset).balanceOf(address(this));
        if (poolBalance < amount) {
            revert PoolBalanceInsufficient(asset, poolBalance, amount);
        }
        IERC20(asset).safeTransfer(to, amount);

        emit Withdraw(asset, msg.sender, to, amount);

        return amount;
    }

    /**
     * @notice Flash loan interface (simplified for exploit testing)
     */
    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata interestRateModes,
        address /*onBehalfOf*/,
        bytes calldata params,
        uint16 referralCode
    ) external {
        require(assets.length == amounts.length, "Inconsistent arrays");
        require(assets.length == interestRateModes.length, "Inconsistent arrays");

        uint256[] memory premiums = new uint256[](assets.length);

        // Transfer assets to receiver and calculate premiums
        for (uint256 i = 0; i < assets.length; i++) {
            premiums[i] = (amounts[i] * FLASHLOAN_PREMIUM_TOTAL) / 10000;
            IERC20(assets[i]).safeTransfer(receiverAddress, amounts[i]);

            emit FlashLoanExecuted(
                receiverAddress,
                msg.sender,
                assets[i],
                amounts[i],
                uint8(interestRateModes[i]),
                premiums[i],
                referralCode
            );
        }

        // Execute operation on receiver
        IFlashLoanReceiver(receiverAddress).executeOperation(
            assets,
            amounts,
            premiums,
            msg.sender,
            params
        );

        // Collect assets + premiums back
        for (uint256 i = 0; i < assets.length; i++) {
            uint256 amountPlusPremium = amounts[i] + premiums[i];
            IERC20(assets[i]).safeTransferFrom(
                receiverAddress,
                address(this),
                amountPlusPremium
            );
        }
    }

    /**
     * @notice Flash loan simple interface (single asset)
     */
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external {
        uint256 premium = (amount * FLASHLOAN_PREMIUM_TOTAL) / 10000;

        // Transfer asset to receiver
        IERC20(asset).safeTransfer(receiverAddress, amount);

        emit FlashLoanExecuted(
            receiverAddress,
            msg.sender,
            asset,
            amount,
            0,
            premium,
            referralCode
        );

        // Execute operation
        IFlashLoanSimpleReceiver(receiverAddress).executeOperation(
            asset,
            amount,
            premium,
            msg.sender,
            params
        );

        // Collect asset + premium back
        IERC20(asset).safeTransferFrom(
            receiverAddress,
            address(this),
            amount + premium
        );
    }
}

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

interface IFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}
