import { convertTargetLeverageBpsToX } from "./dloop.utils";

describe("Test convertTargetLeverageBpsToX()", () => {
  const testCases: [number, string][] = [
    [30000, "3X"],
    [50000, "5X"],
    [10000, "1X"],
    [20000, "2X"],
    [40000, "4X"],
    [60000, "6X"],
    [70000, "7X"],
    [80000, "8X"],
    [90000, "9X"],
    [100000, "10X"],
    // Need rounding affects
    [32545, "3X"],
    [44999, "4X"],
    [45001, "5X"],
    [49999, "5X"],
    [50000.1434, "5X"],
  ];

  testCases.forEach(([targetLeverageBps, expected]) => {
    it(`targetLeverageBps: ${targetLeverageBps}`, () => {
      expect(convertTargetLeverageBpsToX(targetLeverageBps)).toEqual(expected);
    });
  });
});
