// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockPoolAddressesProvider
 * @notice Mock addresses provider for testing
 */
contract MockPoolAddressesProvider {
    address private _pool;
    address private _priceOracle;

    constructor(address pool, address priceOracle) {
        _pool = pool;
        _priceOracle = priceOracle;
    }

    function getPool() external view returns (address) {
        return _pool;
    }

    function getPriceOracle() external view returns (address) {
        return _priceOracle;
    }

    function setPool(address pool) external {
        _pool = pool;
    }

    function setPriceOracle(address priceOracle) external {
        _priceOracle = priceOracle;
    }
}
