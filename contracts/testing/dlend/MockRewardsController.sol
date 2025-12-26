// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts-5/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts-5/token/ERC20/utils/SafeERC20.sol";
import { IRewardsController } from "contracts/vaults/dLOOP/core/venue/dlend/interface/IRewardsController.sol";

contract MockRewardsController is IRewardsController {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public emission;
    address public rewardSource;

    constructor(address rewardSource_) {
        rewardSource = rewardSource_;
    }

    function setEmission(address rewardToken, uint256 amount) external {
        emission[rewardToken] = amount;
    }

    function claimRewards(
        address[] calldata assets,
        uint256 amount,
        address to,
        address reward
    ) external override returns (uint256) {
        assets;
        amount;
        uint256 rewardAmount = emission[reward];
        if (rewardAmount > 0) {
            IERC20(reward).safeTransferFrom(rewardSource, to, rewardAmount);
            return rewardAmount;
        }
        return 0;
    }

    function claimRewardsOnBehalf(
        address[] calldata assets,
        uint256 amount,
        address user,
        address to,
        address reward
    ) external override returns (uint256) {
        assets;
        amount;
        user;
        uint256 rewardAmount = emission[reward];
        if (rewardAmount > 0) {
            IERC20(reward).safeTransferFrom(rewardSource, to, rewardAmount);
            return rewardAmount;
        }
        return 0;
    }

    function claimRewardsToSelf(
        address[] calldata assets,
        uint256 amount,
        address reward
    ) external override returns (uint256) {
        assets;
        amount;
        uint256 rewardAmount = emission[reward];
        if (rewardAmount > 0) {
            IERC20(reward).safeTransferFrom(rewardSource, msg.sender, rewardAmount);
            return rewardAmount;
        }
        return 0;
    }

    function claimAllRewards(
        address[] calldata assets,
        address to
    ) external override returns (address[] memory rewardsList, uint256[] memory claimedAmounts) {
        assets;
        to;
        rewardsList = new address[](0);
        claimedAmounts = new uint256[](0);
    }

    function claimAllRewardsOnBehalf(
        address[] calldata assets,
        address user,
        address to
    ) external override returns (address[] memory rewardsList, uint256[] memory claimedAmounts) {
        assets;
        user;
        to;
        rewardsList = new address[](0);
        claimedAmounts = new uint256[](0);
    }

    function claimAllRewardsToSelf(
        address[] calldata assets
    ) external override returns (address[] memory rewardsList, uint256[] memory claimedAmounts) {
        assets;
        rewardsList = new address[](0);
        claimedAmounts = new uint256[](0);
    }
}
