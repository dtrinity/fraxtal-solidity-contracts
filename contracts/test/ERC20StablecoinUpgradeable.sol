// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable-493/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable-493/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable-493/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable-493/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable-493/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable-493/token/ERC20/extensions/ERC20FlashMintUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable-493/proxy/utils/Initializable.sol";

import "./extensions/ERC20ComplianceUpgradeable.sol";

contract ERC20StablecoinUpgradeable is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ERC20PermitUpgradeable,
    ERC20FlashMintUpgradeable,
    ERC20ComplianceUpgradeable
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory name,
        string memory symbol
    ) public initializer {
        __ERC20_init(name, symbol);
        __ERC20Burnable_init();
        __Pausable_init();
        __AccessControl_init();
        __ERC20Permit_init(name);
        __ERC20FlashMint_init();
        __ERC20Compliance_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function freeze(address account) public virtual onlyRole(COMPLIANCE_ROLE) {
        _freeze(account);
    }

    function unfreeze(
        address account
    ) public virtual onlyRole(COMPLIANCE_ROLE) {
        _unfreeze(account);
    }

    function seize(
        address account,
        uint256 amount
    ) public virtual onlyRole(COMPLIANCE_ROLE) {
        _seize(account, amount);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused whenNotFrozen(from) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
