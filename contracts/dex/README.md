# dTrinity DEX core smart contracts

This project is a fork of the Uniswap v3.

## Origin

- `core`: Forked from [Uniswap v3-core](https://github.com/Uniswap/v3-core) at [d8b1c635c275d2a9450bd6a78f3fa2484fef73eb](https://github.com/Uniswap/v3-core/commit/d8b1c635c275d2a9450bd6a78f3fa2484fef73eb).

- `periphery`: Forked from [Uniswap v3-periphery](https://github.com/Uniswap/v3-periphery) at [697c2474757ea89fec12a4e6db16a574fe259610](https://github.com/Uniswap/v3-periphery/commit/697c2474757ea89fec12a4e6db16a574fe259610).

- `util`: Forked from [Uniswap solidity lib](https://github.com/Uniswap/solidity-lib/tree/master) at [c01640b0f0f1d8a85cba8de378cc48469fcfd9a6](https://github.com/Uniswap/solidity-lib/commit/c01640b0f0f1d8a85cba8de378cc48469fcfd9a6).

## License

This project inherits the license from the original repository.

## Update `POOL_INIT_CODE_HASH`

When making changes to the `UniswapV3Pool` contract, you need to update the `POOL_INIT_CODE_HASH` in the `contracts/dex/periphery/libraries/PoolAddress.sol`

- Reference: [https://ethereum.stackexchange.com/a/107643](https://ethereum.stackexchange.com/a/107643)

You can run the following command to get the `POOL_INIT_CODE_HASH`:

```bash
make compute.dex.pool-init-code
```

Example output:

```text
Compiling...
Nothing to compile
No need to generate any newer typings.
------------------------------
Computing DEX pool init code...
POOL_INIT_CODE_HASH: 0xd3e7f58b9af034cfa7a0597e539bae7c6b393817a47a6fc1e1503cd6eaffe22a
```
