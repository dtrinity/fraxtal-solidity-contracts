// SPDX-License-Identifier: MIT
/* ———————————————————————————————————————————————————————————————————————————————— *
 *    _____     ______   ______     __     __   __     __     ______   __  __       *
 *   /\  __-.  /\__  _\ /\  == \   /\ \   /\ "-.\ \   /\ \   /\__  _\ /\ \_\ \      *
 *   \ \ \/\ \ \/_/\ \/ \ \  __<   \ \ \  \ \ \-.  \  \ \ \  \/_/\ \/ \ \____ \     *
 *    \ \____-    \ \_\  \ \_\ \_\  \ \_\  \ \_\\"\_\  \ \_\    \ \_\  \/\_____\    *
 *     \/____/     \/_/   \/_/ /_/   \/_/   \/_/ \/_/   \/_/     \/_/   \/_____/    *
 *                                                                                  *
 * ————————————————————————————————— dtrinity.org ————————————————————————————————— *
 *                                                                                  *
 *                                         ▲                                        *
 *                                        ▲ ▲                                       *
 *                                                                                  *
 * ———————————————————————————————————————————————————————————————————————————————— *
 * dTRINITY Protocol: https://github.com/dtrinity                                   *
 * ———————————————————————————————————————————————————————————————————————————————— */

pragma solidity ^0.8.20;

/**
 * @dev Interface for Curve.Fi StableSwapNG contract.
 * @dev Generated October 2024 based https://etherscan.io/address/0x02950460e2b9529d0e00284a5fa2d7bdf3fa4d72#code
 */

interface ICurveStableSwapNG {
    // Events
    event Transfer(
        address indexed sender,
        address indexed receiver,
        uint256 value
    );
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );
    event TokenExchange(
        address indexed buyer,
        int128 sold_id,
        uint256 tokens_sold,
        int128 bought_id,
        uint256 tokens_bought
    );
    event TokenExchangeUnderlying(
        address indexed buyer,
        int128 sold_id,
        uint256 tokens_sold,
        int128 bought_id,
        uint256 tokens_bought
    );
    event AddLiquidity(
        address indexed provider,
        uint256[] token_amounts,
        uint256[] fees,
        uint256 invariant,
        uint256 token_supply
    );
    event RemoveLiquidity(
        address indexed provider,
        uint256[] token_amounts,
        uint256[] fees,
        uint256 token_supply
    );
    event RemoveLiquidityOne(
        address indexed provider,
        int128 token_id,
        uint256 token_amount,
        uint256 coin_amount,
        uint256 token_supply
    );
    event RemoveLiquidityImbalance(
        address indexed provider,
        uint256[] token_amounts,
        uint256[] fees,
        uint256 invariant,
        uint256 token_supply
    );
    event RampA(
        uint256 old_A,
        uint256 new_A,
        uint256 initial_time,
        uint256 future_time
    );
    event StopRampA(uint256 A, uint256 t);
    event ApplyNewFee(uint256 fee, uint256 offpeg_fee_multiplier);

    // State Variables
    function coins(uint256 i) external view returns (address);

    function balances(uint256 i) external view returns (uint256);

    function fee() external view returns (uint256);

    function offpeg_fee_multiplier() external view returns (uint256);

    function admin_fee() external view returns (uint256);

    function initial_A() external view returns (uint256);

    function future_A() external view returns (uint256);

    function initial_A_time() external view returns (uint256);

    function future_A_time() external view returns (uint256);

    function admin_balances(uint256 i) external view returns (uint256);

    function ma_exp_time() external view returns (uint256);

    function D_ma_time() external view returns (uint256);

    function ma_last_time() external view returns (uint256);

    // Public functions
    function A() external view returns (uint256);

    function A_precise() external view returns (uint256);

    function get_virtual_price() external view returns (uint256);

    function calc_token_amount(
        uint256[] calldata amounts,
        bool is_deposit
    ) external view returns (uint256);

    function add_liquidity(
        uint256[] calldata amounts,
        uint256 min_mint_amount
    ) external returns (uint256);

    function add_liquidity(
        uint256[] calldata amounts,
        uint256 min_mint_amount,
        address receiver
    ) external returns (uint256);

    function get_dy(
        int128 i,
        int128 j,
        uint256 dx
    ) external view returns (uint256);

    function get_dx(
        int128 i,
        int128 j,
        uint256 dy
    ) external view returns (uint256);

    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy,
        address receiver
    ) external returns (uint256);

    function exchange_received(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256);

    function exchange_received(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy,
        address receiver
    ) external returns (uint256);

    function remove_liquidity(
        uint256 amount,
        uint256[] calldata min_amounts
    ) external returns (uint256[] memory);

    function remove_liquidity(
        uint256 amount,
        uint256[] calldata min_amounts,
        address receiver
    ) external returns (uint256[] memory);

    function remove_liquidity(
        uint256 amount,
        uint256[] calldata min_amounts,
        address receiver,
        bool claim_admin_fees
    ) external returns (uint256[] memory);

    function remove_liquidity_imbalance(
        uint256[] calldata amounts,
        uint256 max_burn_amount
    ) external returns (uint256);

    function remove_liquidity_imbalance(
        uint256[] calldata amounts,
        uint256 max_burn_amount,
        address receiver
    ) external returns (uint256);

    function calc_withdraw_one_coin(
        uint256 token_amount,
        int128 i
    ) external view returns (uint256);

    function remove_liquidity_one_coin(
        uint256 token_amount,
        int128 i,
        uint256 min_amount
    ) external returns (uint256);

    function remove_liquidity_one_coin(
        uint256 token_amount,
        int128 i,
        uint256 min_amount,
        address receiver
    ) external returns (uint256);

    // Admin functions
    function ramp_A(uint256 future_A, uint256 future_time) external;

    function stop_ramp_A() external;

    function set_new_fee(
        uint256 new_fee,
        uint256 new_offpeg_fee_multiplier
    ) external;

    function set_ma_exp_time(uint256 _ma_exp_time, uint256 _D_ma_time) external;

    function withdraw_admin_fees() external;

    // Additional view functions
    function get_balances() external view returns (uint256[] memory);

    function last_price(uint256 i) external view returns (uint256);

    function ema_price(uint256 i) external view returns (uint256);

    function get_p(uint256 i) external view returns (uint256);

    function price_oracle(uint256 i) external view returns (uint256);

    function D_oracle() external view returns (uint256);

    function dynamic_fee(int128 i, int128 j) external view returns (uint256);

    function stored_rates() external view returns (uint256[] memory);

    // ERC20 functions
    function totalSupply() external view returns (uint256);

    function balanceOf(address account) external view returns (uint256);

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bool);

    // Additional view functions
    function N_COINS() external view returns (uint256);

    function DOMAIN_SEPARATOR() external view returns (bytes32);

    function nonces(address owner) external view returns (uint256);

    function name() external view returns (string memory);

    function symbol() external view returns (string memory);

    function decimals() external view returns (uint8);

    function version() external view returns (string memory);

    function salt() external view returns (bytes32);
}
