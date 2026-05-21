// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

contract MockPoolAddressesProvider {
    address private _poolConfigurator;
    address private _aclManager;

    constructor(address poolConfigurator, address aclManager) {
        _poolConfigurator = poolConfigurator;
        _aclManager = aclManager;
    }

    function getPoolConfigurator() external view returns (address) {
        return _poolConfigurator;
    }

    function getACLManager() external view returns (address) {
        return _aclManager;
    }

    function setPoolConfigurator(address poolConfigurator) external {
        _poolConfigurator = poolConfigurator;
    }
}

contract MockPoolConfigurator {
    event ReserveFreezeSet(address indexed caller, address indexed asset, bool freeze);
    event ReservePauseSet(address indexed caller, address indexed asset, bool paused);

    mapping(address => bool) public frozen;
    mapping(address => bool) public paused;
    address[] public frozenAssets;

    function setReserveFreeze(address asset, bool freeze) external {
        frozen[asset] = freeze;
        frozenAssets.push(asset);
        emit ReserveFreezeSet(msg.sender, asset, freeze);
    }

    function setReservePause(address asset, bool paused_) external {
        paused[asset] = paused_;
        emit ReservePauseSet(msg.sender, asset, paused_);
    }

    function frozenAssetsLength() external view returns (uint256) {
        return frozenAssets.length;
    }
}

contract MockACLManager {
    mapping(address => bool) private _riskAdmins;
    mapping(address => bool) private _emergencyAdmins;
    mapping(address => bool) private _poolAdmins;

    function setRiskAdmin(address admin, bool enabled) external {
        _riskAdmins[admin] = enabled;
    }

    function setEmergencyAdmin(address admin, bool enabled) external {
        _emergencyAdmins[admin] = enabled;
    }

    function setPoolAdmin(address admin, bool enabled) external {
        _poolAdmins[admin] = enabled;
    }

    function isRiskAdmin(address admin) external view returns (bool) {
        return _riskAdmins[admin];
    }

    function isEmergencyAdmin(address admin) external view returns (bool) {
        return _emergencyAdmins[admin];
    }

    function isPoolAdmin(address admin) external view returns (bool) {
        return _poolAdmins[admin];
    }
}
