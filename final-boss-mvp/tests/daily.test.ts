import { describe, it, expect } from "vitest";

// Test the completion signal detection logic (extracted as a pure function for testability)
function isCompletionSignal(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return lower === "done" || lower === "completed" || lower === "✅";
}

function isSkipSignal(text: string): boolean {
  return text.toLowerCase().trim() === "skip";
}

describe("daily routing signals", () => {
  it("detects completion signals", () => {
    expect(isCompletionSignal("done")).toBe(true);
    expect(isCompletionSignal("Done")).toBe(true);
    expect(isCompletionSignal("completed")).toBe(true);
    expect(isCompletionSignal("✅")).toBe(true);
    expect(isCompletionSignal("I did it today")).toBe(false);
    expect(isCompletionSignal("done with life")).toBe(false);
  });

  it("detects skip signal", () => {
    expect(isSkipSignal("skip")).toBe(true);
    expect(isSkipSignal("Skip")).toBe(true);
    expect(isSkipSignal("skip it")).toBe(false);
  });
});
