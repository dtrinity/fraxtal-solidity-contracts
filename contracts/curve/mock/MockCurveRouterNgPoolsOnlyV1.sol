// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ICurveRouterNgPoolsOnlyV1 } from "contracts/curve/interfaces/ICurveRouterNgPoolsOnlyV1.sol";
import { ERC20 } from "@rari-capital/solmate/src/tokens/ERC20.sol";

contract MockCurveRouterNgPoolsOnlyV1 is ICurveRouterNgPoolsOnlyV1 {
    error InsufficientPoolBalance(address token, uint256 requested, uint256 available);
    error ExchangeRateNotSet(address token0, address token1);
    error TokenNotInPool(address token);
    error InsufficientOutputAmount(uint256 outputAmount, uint256 minOutputAmount);

    mapping(address => uint256) internal poolBalances;
    mapping(address => mapping(address => uint256)) internal exchangeRates; // token0 -> token1 -> rate
    uint256 public immutable priceDecimals;

    constructor(uint256 _priceDecimals) {
        priceDecimals = _priceDecimals;
    }

    function refillFund(address token, uint256 amount) external {
        ERC20(token).transferFrom(msg.sender, address(this), amount);
        poolBalances[token] += amount;
    }

    function setExchangeRate(address token0, address token1, uint256 rate) external {
        exchangeRates[token0][token1] = rate;
    }

    function exchange(
        address[11] calldata _route,
        uint256[4][5] calldata _swap_params,
        uint256 _amount,
        uint256 _min_dy
    ) external payable returns (uint256) {
        return _exchange(_route, _swap_params, _amount, _min_dy, msg.sender);
    }

    function exchange(
        address[11] calldata _route,
        uint256[4][5] calldata _swap_params,
        uint256 _amount,
        uint256 _min_dy,
        address _receiver
    ) external payable returns (uint256) {
        return _exchange(_route, _swap_params, _amount, _min_dy, _receiver);
    }

    function _exchange(
        address[11] calldata _route,
        uint256[4][5] calldata _swap_params,
        uint256 _amount,
        uint256 _min_dy,
        address _receiver
    ) internal returns (uint256) {
        // Get input and output tokens
        address inputToken = _route[0];
        address outputToken;
        for (uint256 i = _route.length - 1; i >= 0; i--) {
            if (_route[i] != address(0)) {
                outputToken = _route[i];
                break;
            }
        }

        // Check if tokens are in pool
        if (poolBalances[inputToken] == 0) {
            revert TokenNotInPool(inputToken);
        }
        if (poolBalances[outputToken] == 0) {
            revert TokenNotInPool(outputToken);
        }

        // Check if exchange rate is set
        if (exchangeRates[inputToken][outputToken] == 0) {
            revert ExchangeRateNotSet(inputToken, outputToken);
        }

        // Transfer input tokens from sender
        ERC20(inputToken).transferFrom(msg.sender, address(this), _amount);
        poolBalances[inputToken] += _amount;

        // Calculate output amount (simplified mock implementation)
        uint256 outputAmount = get_dy(_route, _swap_params, _amount);
        if (outputAmount < _min_dy) {
            revert InsufficientOutputAmount(outputAmount, _min_dy);
        }

        // Check if we have enough balance
        if (poolBalances[outputToken] < outputAmount) {
            revert InsufficientPoolBalance(outputToken, outputAmount, poolBalances[outputToken]);
        }

        // Transfer output tokens to receiver
        poolBalances[outputToken] -= outputAmount;
        ERC20(outputToken).transfer(_receiver, outputAmount);

        emit Exchange(msg.sender, _receiver, _route, _swap_params, _amount, outputAmount);

        return outputAmount;
    }

    function get_dy(
        address[11] calldata _route,
        uint256[4][5] calldata, // _swap_params is not used in this mock implementation
        uint256 _amount
    ) public view returns (uint256) {
        address inputToken = _route[0];
        address outputToken;
        for (uint256 i = _route.length - 1; i >= 0; i--) {
            if (_route[i] != address(0)) {
                outputToken = _route[i];
                break;
            }
        }

        uint256 rate = exchangeRates[inputToken][outputToken];
        if (rate == 0) {
            revert ExchangeRateNotSet(inputToken, outputToken);
        }

        uint256 inputDecimals = ERC20(inputToken).decimals();
        uint256 outputDecimals = ERC20(outputToken).decimals();

        // Adjust for decimals difference and price decimals
        return (_amount * rate * (10 ** (outputDecimals))) / 10 ** (inputDecimals + priceDecimals);
    }

    function get_dx(
        address[11] calldata _route,
        uint256[4][5] calldata, // _swap_params is not used in this mock implementation
        uint256 _out_amount
    ) external view returns (uint256) {
        address inputToken = _route[0];
        address outputToken;
        for (uint256 i = _route.length - 1; i >= 0; i--) {
            if (_route[i] != address(0)) {
                outputToken = _route[i];
                break;
            }
        }

        uint256 rate = exchangeRates[inputToken][outputToken];
        if (rate == 0) {
            revert ExchangeRateNotSet(inputToken, outputToken);
        }

        uint256 inputDecimals = ERC20(inputToken).decimals();
        uint256 outputDecimals = ERC20(outputToken).decimals();
        // Adjust for decimals difference and price decimals
        return (_out_amount * (10 ** (inputDecimals + priceDecimals))) / (rate * (10 ** outputDecimals));
    }

    function version() external pure returns (string memory) {
        return "mock-pools-only-v1";
    }
}
