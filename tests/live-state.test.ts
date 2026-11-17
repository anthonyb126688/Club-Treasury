import { describe, expect, it } from "vitest";
import { hasError, initialLiveState, onFailure, onSuccess, updatedLabel } from "@/lib/live/state";

describe("live data state", () => {
  it("keeps the last good data through one failure, errors after two in a row", () => {
    let s = initialLiveState<number>();
    s = onSuccess(s, 5, 1000);
    s = onFailure(s);
    expect(s.data).toBe(5);
    expect(hasError(s)).toBe(false);
    s = onFailure(s);
    expect(s.data).toBe(5);
    expect(hasError(s)).toBe(true);
  });

  it("a success clears the failures", () => {
    let s = onFailure(onFailure(initialLiveState<number>()));
    expect(hasError(s)).toBe(true);
    s = onSuccess(s, 7, 2000);
    expect(hasError(s)).toBe(false);
    expect(s).toEqual({ data: 7, failures: 0, updatedAt: 2000 });
  });
});

describe("updatedLabel", () => {
  it("reads like a person would say it", () => {
    expect(updatedLabel(null, 0)).toBe("");
    expect(updatedLabel(0, 10_000)).toBe("Updated just now");
    expect(updatedLabel(0, 120_000)).toBe("Updated 2 min ago");
    expect(updatedLabel(0, 2 * 60 * 60 * 1000)).toBe("Updated 2 hr ago");
  });
});
