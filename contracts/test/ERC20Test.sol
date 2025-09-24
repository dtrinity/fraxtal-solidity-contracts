// SPDX-License-Identifier: Unlicense
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

// Reference: https://gist.github.com/BlockmanCodes/d50eadf80447db00a99df2559700054e#file-tether-sol
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-5/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-5/access/Ownable.sol";
import "@openzeppelin/contracts-5/token/ERC20/extensions/ERC20FlashMint.sol";

contract ERC20Test is ERC20, Ownable, ERC20FlashMint {
    uint8 private _decimals;

    constructor(string memory symbol_, uint8 decimals_) ERC20(symbol_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
