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

/**
 * @dev Interface for Curve.Fi RouterNG contract.
 * @dev See original implementation in official repository:
 * https://github.com/curvefi/curve-router-ng/blob/master/contracts/Router.vy
 * ABI: https://etherscan.io/address/0x16C6521Dff6baB339122a0FE25a9116693265353#code
 */

interface ICurveRouterNG {
    event Exchange(
        address indexed sender,
        address indexed receiver,
        address[11] route,
        uint256[5][5] swap_params,
        address[5] pools,
        uint256 in_amount,
        uint256 out_amount
    );

    fallback() external payable;

    receive() external payable;

    function exchange(
        address[11] calldata _route,
        uint256[5][5] calldata _swap_params,
        uint256 _amount,
        uint256 _min_dy
    ) external payable returns (uint256);

    function exchange(
        address[11] calldata _route,
        uint256[5][5] calldata _swap_params,
        uint256 _amount,
        uint256 _min_dy,
        address[5] calldata _pools
    ) external payable returns (uint256);

    function exchange(
        address[11] calldata _route,
        uint256[5][5] calldata _swap_params,
        uint256 _amount,
        uint256 _min_dy,
        address[5] calldata _pools,
        address _receiver
    ) external payable returns (uint256);

    function get_dy(
        address[11] calldata _route,
        uint256[5][5] calldata _swap_params,
        uint256 _amount
    ) external view returns (uint256);

    function get_dy(
        address[11] calldata _route,
        uint256[5][5] calldata _swap_params,
        uint256 _amount,
        address[5] calldata _pools
    ) external view returns (uint256);

    function get_dx(
        address[11] calldata _route,
        uint256[5][5] calldata _swap_params,
        uint256 _out_amount,
        address[5] calldata _pools
    ) external view returns (uint256);

    function get_dx(
        address[11] calldata _route,
        uint256[5][5] calldata _swap_params,
        uint256 _out_amount,
        address[5] calldata _pools,
        address[5] calldata _base_pools
    ) external view returns (uint256);

    function get_dx(
        address[11] calldata _route,
        uint256[5][5] calldata _swap_params,
        uint256 _out_amount,
        address[5] calldata _pools,
        address[5] calldata _base_pools,
        address[5] calldata _base_tokens
    ) external view returns (uint256);

    function version() external view returns (string memory);
}
