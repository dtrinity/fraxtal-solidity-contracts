// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable-493/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable-493/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable-493/proxy/utils/Initializable.sol";

/**
 * @dev Extension of {ERC20} that allows a compliance role to freeze and seize
 * tokens for compliance purposes.
 */
abstract contract ERC20ComplianceUpgradeable is
    Initializable,
    ContextUpgradeable,
    ERC20Upgradeable
{
    mapping(address => bool) private _frozen;

    function __ERC20Compliance_init() internal onlyInitializing {}

    function __ERC20Compliance_init_unchained() internal onlyInitializing {}

    modifier whenNotFrozen(address account) {
        require(!_frozen[account], "ERC20Compliance: account is frozen");
        _;
    }

    function _freeze(address account) internal virtual {
        _frozen[account] = true;
    }

    function _unfreeze(address account) internal virtual {
        _frozen[account] = false;
    }

    function _seize(address account, uint256 amount) internal virtual {
        _burn(account, amount);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
