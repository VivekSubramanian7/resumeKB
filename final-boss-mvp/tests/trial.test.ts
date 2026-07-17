import { describe, it, expect } from "vitest";
import { getTrialDayNumber } from "../src/services/trial.js";

describe("getTrialDayNumber", () => {
  it("returns 1 on the start date", () => {
    const today = new Date().toISOString().split("T")[0] as string;
    expect(getTrialDayNumber(today)).toBe(1);
  });

  it("returns 7 after 6 days", () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0] as string;
    expect(getTrialDayNumber(sixDaysAgo)).toBe(7);
  });

  it("returns 8 after trial period ends", () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0] as string;
    expect(getTrialDayNumber(sevenDaysAgo)).toBe(8);
  });
});
