// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {ILendingPoolAddressesProvider} from "./ILendingPoolAddressesProvider.sol";
import "../../../../lending/core/interfaces/IPool.sol";

interface ILendingPool is IPool {}
