// SPDX-License-Identifier: GNU AGPLv3
pragma solidity 0.8.20;

import { FlashMintLiquidatorAaveBorrowRepayBase, SafeTransferLib, ERC20, IERC3156FlashLender, ILendingPoolAddressesProvider, ILendingPool, IAToken } from "./FlashMintLiquidatorAaveBorrowRepayBase.sol";
import { CurveHelper } from "contracts/curve/CurveHelper.sol";
import { ICurveRouterNgPoolsOnlyV1 } from "contracts/curve/interfaces/ICurveRouterNgPoolsOnlyV1.sol";
import { ICurveRouterWrapper } from "contracts/curve/interfaces/ICurveRouterWrapper.sol";
import { Strings } from "@openzeppelin/contracts-5/utils/Strings.sol";

contract FlashMintLiquidatorAaveBorrowRepayCurve is FlashMintLiquidatorAaveBorrowRepayBase {
    using SafeTransferLib for ERC20;

    error NotSupportedCustomSwapData(address _inputToken, address _outputToken, bytes _swapData);

    struct CurveSwapExtraParamsDefaultConfig {
        address inputToken;
        address outputToken;
        CurveHelper.CurveSwapExtraParams swapExtraParams;
        CurveHelper.CurveSwapExtraParams reverseSwapExtraParams;
    }

    ICurveRouterNgPoolsOnlyV1 public immutable curveRouter;
    uint256 public immutable maxSlippageSurplusSwapBps;
    mapping(string => CurveHelper.CurveSwapExtraParams) public defaultSwapParams;
    mapping(string => bool) public isSwapParamsSet;

    constructor(
        IERC3156FlashLender _flashMinter,
        ILendingPoolAddressesProvider _addressesProvider,
        ILendingPool _liquidateLender,
        IAToken _aDUSD,
        uint256 _slippageTolerance,
        ICurveRouterNgPoolsOnlyV1 _curveRouter,
        uint256 _maxSlippageSurplusSwapBps,
        CurveSwapExtraParamsDefaultConfig[] memory _defaultSwapParamsList
    )
        FlashMintLiquidatorAaveBorrowRepayBase(
            _flashMinter,
            _addressesProvider,
            _liquidateLender,
            _aDUSD,
            _slippageTolerance
        )
    {
        curveRouter = ICurveRouterNgPoolsOnlyV1(payable(address(_curveRouter)));
        maxSlippageSurplusSwapBps = _maxSlippageSurplusSwapBps;

        for (uint256 i = 0; i < _defaultSwapParamsList.length; i++) {
            // Set for forward swap
            string memory key = _getSwapExtraParamsKey(
                _defaultSwapParamsList[i].inputToken,
                _defaultSwapParamsList[i].outputToken
            );
            if (isSwapParamsSet[key]) {
                revert ICurveRouterWrapper.DuplicateKeyForSwapExtraParams(
                    _defaultSwapParamsList[i].inputToken,
                    _defaultSwapParamsList[i].outputToken,
                    key
                );
            }
            isSwapParamsSet[key] = true;
            defaultSwapParams[key] = _defaultSwapParamsList[i].swapExtraParams;

            // Set for reverse swap
            string memory reverseKey = _getSwapExtraParamsKey(
                _defaultSwapParamsList[i].outputToken,
                _defaultSwapParamsList[i].inputToken
            );
            if (isSwapParamsSet[reverseKey]) {
                revert ICurveRouterWrapper.DuplicateKeyForSwapExtraParams(
                    _defaultSwapParamsList[i].outputToken,
                    _defaultSwapParamsList[i].inputToken,
                    reverseKey
                );
            }
            isSwapParamsSet[reverseKey] = true;
            defaultSwapParams[reverseKey] = _defaultSwapParamsList[i].reverseSwapExtraParams;
        }
    }

    function setSwapExtraParams(CurveSwapExtraParamsDefaultConfig memory _swapExtraParamsConfig) external onlyOwner {
        string memory key = _getSwapExtraParamsKey(
            _swapExtraParamsConfig.inputToken,
            _swapExtraParamsConfig.outputToken
        );
        isSwapParamsSet[key] = true;
        defaultSwapParams[key] = _swapExtraParamsConfig.swapExtraParams;

        string memory reverseKey = _getSwapExtraParamsKey(
            _swapExtraParamsConfig.outputToken,
            _swapExtraParamsConfig.inputToken
        );
        isSwapParamsSet[reverseKey] = true;
        defaultSwapParams[reverseKey] = _swapExtraParamsConfig.reverseSwapExtraParams;
    }

    function _getSwapExtraParamsKey(address _inputToken, address _outputToken) internal pure returns (string memory) {
        string memory key = string.concat(
            Strings.toHexString(uint160(_inputToken), 20),
            "-",
            Strings.toHexString(uint160(_outputToken), 20)
        );
        return key;
    }

    function _getSwapExtraParams(
        address _inputToken,
        address _outputToken
    ) internal view returns (CurveHelper.CurveSwapExtraParams memory) {
        string memory key = _getSwapExtraParamsKey(_inputToken, _outputToken);
        // If the key is not found, revert
        if (!isSwapParamsSet[key]) {
            revert ICurveRouterWrapper.NotFoundKeyForSwapExtraParams(_inputToken, _outputToken, key);
        }
        return defaultSwapParams[key];
    }

    /// @inheritdoc FlashMintLiquidatorAaveBorrowRepayBase
    function _swapExactOutput(
        address _inputToken,
        address _outputToken,
        bytes memory _swapData,
        uint256 _amount,
        uint256 _maxIn
    ) internal override returns (uint256 amountIn) {
        // If _swapData is not empty, revert (TODO: need to fix this)
        if (_swapData.length != 0) {
            revert NotSupportedCustomSwapData(_inputToken, _outputToken, _swapData);
        }

        // As Curve does not support exact output swaps, we need to calculate the required input amount
        // and add a buffer to account for potential slippage. Then swapping back the surplus amount
        CurveHelper.CurveSwapExtraParams memory extraParams = _getSwapExtraParams(_inputToken, _outputToken);

        CurveHelper.CurveSwapExtraParams memory reverseExtraParams = _getSwapExtraParams(_outputToken, _inputToken);

        // Double check _inputToken is the first token in the route
        if (_inputToken != extraParams.route[0]) {
            revert ICurveRouterWrapper.InvalidInputTokenInRoute(_inputToken, extraParams.route);
        }

        return
            CurveHelper.swapExactOutput(
                curveRouter,
                extraParams.route,
                extraParams.swapParams,
                reverseExtraParams.route,
                reverseExtraParams.swapParams,
                extraParams.swapSlippageBufferBps,
                maxSlippageSurplusSwapBps,
                _amount,
                _maxIn
            );
    }
}
