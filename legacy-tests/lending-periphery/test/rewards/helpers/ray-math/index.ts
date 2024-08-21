import BigNumber from "bignumber.js";

import { BigNumberValue, valueToZDBigNumber } from "./bignumber";

/**
 *
 * @param emissionPerSecond
 * @param lastUpdateTimestamp
 * @param currentTimestamp
 */
export function getLinearCumulatedRewards(
  emissionPerSecond: BigNumberValue,
  lastUpdateTimestamp: BigNumberValue,
  currentTimestamp: BigNumberValue,
): BigNumber {
  const timeDelta = valueToZDBigNumber(currentTimestamp).minus(
    lastUpdateTimestamp.toString(),
  );
  return timeDelta.multipliedBy(emissionPerSecond.toString());
}

/**
 *
 * @param balance
 * @param oldIndex
 * @param emissionPerSecond
 * @param lastUpdateTimestamp
 * @param currentTimestamp
 * @param emissionEndTimestamp
 * @param precision
 */
export function getNormalizedDistribution(
  balance: BigNumberValue,
  oldIndex: BigNumberValue,
  emissionPerSecond: BigNumberValue,
  lastUpdateTimestamp: BigNumberValue,
  currentTimestamp: BigNumberValue,
  emissionEndTimestamp: BigNumberValue,
  precision: number = 18,
): BigNumber {
  if (
    balance.toString() === "0" ||
    emissionPerSecond.toString() === "0" ||
    valueToZDBigNumber(currentTimestamp).eq(lastUpdateTimestamp.toString()) ||
    valueToZDBigNumber(lastUpdateTimestamp).gte(emissionEndTimestamp.toString())
  ) {
    return valueToZDBigNumber(oldIndex);
  }
  const linearReward = getLinearCumulatedRewards(
    emissionPerSecond,
    lastUpdateTimestamp,
    valueToZDBigNumber(currentTimestamp).gte(emissionEndTimestamp.toString())
      ? emissionEndTimestamp
      : currentTimestamp,
  );

  return linearReward
    .multipliedBy(valueToZDBigNumber(10).exponentiatedBy(precision))
    .div(balance.toString())
    .plus(oldIndex.toString());
}
