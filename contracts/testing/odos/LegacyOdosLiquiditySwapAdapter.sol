// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.10;

import {IPoolAddressesProvider} from "contracts/lending/core/interfaces/IPoolAddressesProvider.sol";
import {IOdosRouterV2} from "contracts/odos/interface/IOdosRouterV2.sol";
import {OdosLiquiditySwapAdapter} from "contracts/lending/periphery/adapters/odos/OdosLiquiditySwapAdapter.sol";
import {IOdosLiquiditySwapAdapter} from "contracts/lending/periphery/adapters/odos/interfaces/IOdosLiquiditySwapAdapter.sol";

/**
 * @dev Legacy testing adapter that preserves the pre-mitigation behaviour
 *      (no msg.sender vs user enforcement) so the exploit can still be
 *      reproduced for RCA documentation.
 */
contract LegacyOdosLiquiditySwapAdapter is OdosLiquiditySwapAdapter {
    constructor(
        IPoolAddressesProvider addressesProvider,
        address pool,
        IOdosRouterV2 swapRouter,
        address owner
    ) OdosLiquiditySwapAdapter(addressesProvider, pool, swapRouter, owner) {}

    /// @inheritdoc IOdosLiquiditySwapAdapter
    function swapLiquidity(
        LiquiditySwapParams memory liquiditySwapParams,
        PermitInput memory collateralATokenPermit
    ) external override nonReentrant {
        if (!liquiditySwapParams.withFlashLoan) {
            _swapAndDeposit(liquiditySwapParams, collateralATokenPermit);
        } else {
            _flash(liquiditySwapParams, collateralATokenPermit);
        }
    }
}
