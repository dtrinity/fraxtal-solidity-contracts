// SPDX-License-Identifier: AGPL-3.0
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

import {ITransferStrategyBase} from "../rewards/interfaces/ITransferStrategyBase.sol";
import {TransferStrategyBase} from "../rewards/transfer-strategies/TransferStrategyBase.sol";
import {GPv2SafeERC20} from "contracts/lending/core/dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {IERC20} from "contracts/lending/core/dependencies/openzeppelin/contracts/IERC20.sol";

/**
 * @title MockBadTransferStrategy
 * @notice Transfer strategy that always return false at performTransfer and does noop.
 * @author Aave
 **/
contract MockBadTransferStrategy is TransferStrategyBase {
    using GPv2SafeERC20 for IERC20;

    // Added storage variable to prevent warnings at compilation for performTransfer
    uint256 ignoreWarning;

    constructor(
        address incentivesController,
        address rewardsAdmin
    ) TransferStrategyBase(incentivesController, rewardsAdmin) {}

    /// @inheritdoc TransferStrategyBase
    function performTransfer(
        address,
        address,
        uint256
    ) external override onlyIncentivesController returns (bool) {
        ignoreWarning = 1;
        return false;
    }
}
