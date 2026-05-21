// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import { Ownable } from "../../core/dependencies/openzeppelin/contracts/Ownable.sol";
import { IPoolAddressesProvider } from "../../core/interfaces/IPoolAddressesProvider.sol";
import { IPoolConfigurator } from "../../core/interfaces/IPoolConfigurator.sol";

/**
 * @title DlendFreezeGuardian
 * @notice Governance-owned helper that can only freeze DLend reserves.
 */
contract DlendFreezeGuardian is Ownable {
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    constructor(IPoolAddressesProvider addressesProvider, address governanceSafe) {
        require(address(addressesProvider) != address(0), "DFG_INVALID_PROVIDER");
        require(governanceSafe != address(0), "DFG_INVALID_OWNER");

        ADDRESSES_PROVIDER = addressesProvider;
        transferOwnership(governanceSafe);
    }

    function freezeReserve(address asset) external onlyOwner {
        _poolConfigurator().setReserveFreeze(asset, true);
    }

    function freezeReserves(address[] calldata assets) external onlyOwner {
        IPoolConfigurator configurator = _poolConfigurator();

        for (uint256 i = 0; i < assets.length; i++) {
            configurator.setReserveFreeze(assets[i], true);
        }
    }

    function _poolConfigurator() internal view returns (IPoolConfigurator) {
        return IPoolConfigurator(ADDRESSES_PROVIDER.getPoolConfigurator());
    }
}
