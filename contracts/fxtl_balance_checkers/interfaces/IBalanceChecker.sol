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

pragma solidity ^0.8.20;

/**
 * @title IBalanceChecker
 * @author dTrinity
 * @notice Interface for checking effective balances of various token types
 * @dev This interface provides a standardized way to check balances across different token implementations:
 *      - For dLEND tokens: effective balance is calculated as userBalance * (totalSupply - totalDebt) / totalSupply
 *      - For ERC4626 tokens: balance is calculated by converting shares to underlying assets
 *      - For other tokens: balance may be calculated using various strategies
 */
interface IBalanceChecker {
    /**
     * @notice Returns the effective balances for multiple addresses for a single token
     * @param token The address of the token to check balances for
     * @param addresses Array of addresses to check balances for (up to 1000 addresses)
     * @return result Array of effective balances (18 decimals) corresponding to the addresses array
     */
    function tokenBalances(
        address token,
        address[] memory addresses
    ) external view returns (uint256[] memory result);

    /**
     * @notice Returns the effective balances for multiple addresses across multiple tokens
     * @param sources Array of token addresses to check balances for
     * @param addresses Array of addresses to check balances for (up to 1000 addresses)
     * @return result Array of effective balances (18 decimals) for each address across all sources
     */
    function batchTokenBalances(
        address[] memory sources,
        address[] memory addresses
    ) external view returns (uint256[] memory result);
}