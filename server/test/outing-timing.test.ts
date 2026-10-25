import { describe, expect, it } from "vitest";
import { preferredStopCount, suggestedOutingMinutes, stopTimeWarning } from "../../shared/outingTiming";

describe("stop count and outing time guidance", () => {
  it("warns beside a time limit that is too short for selected hour-long visits plus travel", () => {
    expect(stopTimeWarning(2, 90)).toBe("Time may be tight: stopping 2 times usually needs about 2 hours, plus travel.");
    expect(stopTimeWarning(2, 120)).toContain("Time may be tight");
    expect(stopTimeWarning(3, 180)).toContain("stopping 3 times usually needs about 3 hours");
    expect(stopTimeWarning(1, 45)).toContain("stopping 1 time usually needs about 1 hour");
  });
  it("leaves flexible or roomy inputs free of warnings and never changes their values", () => {
    expect(stopTimeWarning(null, 90)).toBeNull();
    expect(stopTimeWarning(2, null)).toBeNull();
    expect(stopTimeWarning(2, 180)).toBeNull();
    expect(stopTimeWarning(1, 60)).toBeNull();
  });
  it("adds travel allowance rather than searching only two hours for a two-stop plan", () => {
    expect(suggestedOutingMinutes(1)).toBe(60);
    expect(suggestedOutingMinutes(2)).toBe(135);
    expect(suggestedOutingMinutes(3)).toBe(210);
    expect(suggestedOutingMinutes(5)).toBe(360);
  });
  it("keeps Flexible members neutral and prioritizes the fuller count on group ties", () => {
    expect(preferredStopCount([null, undefined])).toBeNull();
    expect(preferredStopCount([2, null])).toBe(2);
    expect(preferredStopCount([1, 2])).toBe(2);
    expect(preferredStopCount([2, 3])).toBe(3);
    expect(preferredStopCount([1, 5])).toBe(3);
    expect(preferredStopCount([2, 2, 3])).toBe(2);
  });
});
