import {
  batchedPromiseAll,
  ShortTermIgnoreMemory,
  splitToBatches,
} from "./utils";

describe("Test ShortTermIgnoreMemory", () => {
  it("normal case", () => {
    const tracker = new ShortTermIgnoreMemory(1);
    const startTimestamp = 1487076708000;

    // Mock Date.now
    Date.now = jest.fn(() => startTimestamp);

    // Put a value
    tracker.put("test");
    // As the timer is not increased, the value should be ignored
    expect(tracker.isIgnored("test")).toBeTruthy();

    // Now, increase the timer by 0.5 second
    Date.now = jest.fn(() => startTimestamp + 500);
    // The value should still be ignored
    expect(tracker.isIgnored("test")).toBeTruthy();

    // Now, increase the timer by 0.5 second (total 1 second from the start)
    Date.now = jest.fn(() => startTimestamp + 1000);
    // The value should not be ignored
    expect(tracker.isIgnored("test")).toBeFalsy();

    // Put the value again
    tracker.put("test");
    // The value should be ignored
    expect(tracker.isIgnored("test")).toBeTruthy();

    // Increase the timer by 10 seconds
    Date.now = jest.fn(() => startTimestamp + 10000);
    // The value should not be ignored
    expect(tracker.isIgnored("test")).toBeFalsy();
  });

  it("not existing value", () => {
    const tracker = new ShortTermIgnoreMemory(1);
    const startTimestamp = 1487076708000;

    // Mock Date.now
    Date.now = jest.fn(() => startTimestamp);

    // The value should not be ignored
    expect(tracker.isIgnored("test2")).toBeFalsy();
  });
});

describe("Test batchedPromiseAll()", () => {
  it("number case", async () => {
    const promises = [
      new Promise<number>((resolve) => resolve(1)),
      new Promise<number>((resolve) => resolve(2)),
      new Promise<number>((resolve) => resolve(3)),
      new Promise<number>((resolve) => resolve(4)),
      new Promise<number>((resolve) => resolve(5)),
    ];

    const result = await batchedPromiseAll(promises, 2);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("string case", async () => {
    const promises = [
      new Promise<string>((resolve) => resolve("1")),
      new Promise<string>((resolve) => resolve("2")),
      new Promise<string>((resolve) => resolve("3")),
      new Promise<string>((resolve) => resolve("4")),
      new Promise<string>((resolve) => resolve("5")),
    ];

    const result = await batchedPromiseAll(promises, 2);
    expect(result).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("empty case", async () => {
    const result = await batchedPromiseAll([], 2);
    expect(result).toEqual([]);
  });
});

describe("Test splitToBatches()", () => {
  it("normal case", () => {
    const result = splitToBatches([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
  });

  it("empty case", () => {
    const result = splitToBatches([], 3);
    expect(result).toEqual([]);
  });

  it("smaller than batch size", () => {
    const result = splitToBatches([1, 2], 3);
    expect(result).toEqual([[1, 2]]);
  });
});
