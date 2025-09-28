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

pragma solidity ^0.8.0;

import { WETH9 } from "contracts/dependencies/weth/WETH9.sol";
import { Ownable } from "contracts/lending/core/dependencies/openzeppelin/contracts/Ownable.sol";

contract WETH9Mock is WETH9, Ownable {
    bool internal _protected;

    /**
     * @dev Function modifier, if _protected is enabled then msg.sender is required to be the owner
     */
    modifier onlyOwnerIfProtected() {
        if (_protected == true) {
            require(owner() == _msgSender(), "Ownable: caller is not the owner");
        }
        _;
    }

    constructor(string memory mockName, string memory mockSymbol, address owner) {
        name = mockName;
        symbol = mockSymbol;

        transferOwnership(owner);
        _protected = true;
    }

    function mint(address account, uint256 value) public onlyOwnerIfProtected returns (bool) {
        balanceOf[account] += value;
        emit Transfer(address(0), account, value);
        return true;
    }

    function setProtected(bool state) public onlyOwner {
        _protected = state;
    }

    function isProtected() public view returns (bool) {
        return _protected;
    }
}
