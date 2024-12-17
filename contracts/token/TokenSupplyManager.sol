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
pragma abicoder v2;

import "./IERC20Stablecoin.sol";
import "@openzeppelin/contracts-5/access/Ownable.sol";
import "@openzeppelin/contracts-5/token/ERC20/extensions/ERC20FlashMint.sol";

contract TokenSupplyManager is Ownable {
    IERC20Stablecoin private _collateral;
    IERC20Stablecoin private _receipt;

    uint8 private _collateralDecimals;
    uint8 private _receiptDecimals;

    constructor(
        IERC20Stablecoin collateral,
        IERC20Stablecoin receipt
    ) Ownable(msg.sender) {
        _collateral = collateral;
        _receipt = receipt;
        _collateralDecimals = collateral.decimals();
        _receiptDecimals = receipt.decimals();
    }

    function issue(address to, uint256 collateralAmount) public {
        // Transfer the deposit amount of the collateral token to this contract
        require(
            _collateral.transferFrom(
                msg.sender,
                address(this),
                collateralAmount
            ),
            "Failed to deposit collateral"
        );
        // Convert the deposit amount to the receipt token amount
        uint256 receiptAmount = _convertAmountBetweenDecimals(
            collateralAmount,
            _collateralDecimals,
            _receiptDecimals
        );
        // Mint the issue token to the recipient
        _receipt.mint(to, receiptAmount);
    }

    function redeem(address to, uint256 receiptAmount) public {
        // Burn the receipt token from the sender
        _receipt.burnFrom(msg.sender, receiptAmount);
        // Convert the receipt token amount to the collateral token amount
        uint256 collateralAmount = _convertAmountBetweenDecimals(
            receiptAmount,
            _receiptDecimals,
            _collateralDecimals
        );
        // Transfer the equivalent amount of the collateral token to the recipient
        require(
            _collateral.transfer(to, collateralAmount),
            "Failed to transfer collateral token"
        );
    }

    function migrateCollateral(
        address recipient,
        uint256 collateralAmount
    ) public onlyOwner {
        // Migrate collateral to a different collateral contract
        require(
            _collateral.transfer(recipient, collateralAmount),
            "Failed to transfer collateral token"
        );
    }

    function _convertAmountBetweenDecimals(
        uint256 inputAmount,
        uint8 inputDecimals,
        uint8 outputDecimals
    ) internal pure returns (uint256) {
        int8 shift = int8(outputDecimals) - int8(inputDecimals);
        uint256 outputAmount = inputAmount;
        if (shift > 0) {
            outputAmount *= 10 ** uint8(shift);
        } else if (shift < 0) {
            outputAmount /= 10 ** uint8(-shift);
        }
        return outputAmount;
    }
}
