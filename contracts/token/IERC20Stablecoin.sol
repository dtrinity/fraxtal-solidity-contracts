// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-5/token/ERC20/IERC20.sol";

interface IERC20Stablecoin is IERC20 {
    function mint(address to, uint256 amount) external;

    function burn(uint256 amount) external;

    function burnFrom(address account, uint256 amount) external;

    function decimals() external view returns (uint8);
}
