// SPDX-License-Identifier: UNLICENSED
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

pragma solidity =0.7.6;

import "../libraries/Path.sol";

contract PathTest {
    function hasMultiplePools(bytes memory path) public pure returns (bool) {
        return Path.hasMultiplePools(path);
    }

    function decodeFirstPool(bytes memory path) public pure returns (address tokenA, address tokenB, uint24 fee) {
        return Path.decodeFirstPool(path);
    }

    function getFirstPool(bytes memory path) public pure returns (bytes memory) {
        return Path.getFirstPool(path);
    }

    function skipToken(bytes memory path) public pure returns (bytes memory) {
        return Path.skipToken(path);
    }

    // gas funcs
    function getGasCostOfDecodeFirstPool(bytes memory path) public view returns (uint256) {
        uint256 gasBefore = gasleft();
        Path.decodeFirstPool(path);
        return gasBefore - gasleft();
    }
}
