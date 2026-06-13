import { describe, it, expect } from "vitest";
import { timeAgo, absoluteTime } from "@/app/runs/time-ago";

const NOW = new Date("2026-06-13T12:00:00.000Z");
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("timeAgo", () => {
  it("should say 'just now' for very recent timestamps (happy path)", () => {
    expect(timeAgo(ago(5 * SEC), NOW)).toBe("just now");
    expect(timeAgo(ago(40 * SEC), NOW)).toBe("just now");
  });

  it("should render minutes, hours, and days (state changes)", () => {
    expect(timeAgo(ago(5 * MIN), NOW)).toBe("5m ago");
    expect(timeAgo(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(timeAgo(ago(2 * DAY), NOW)).toBe("2d ago");
    expect(timeAgo(ago(3 * 7 * DAY), NOW)).toBe("3w ago");
  });

  it("should fall back to an absolute short date past ~a month (edge case)", () => {
    const out = timeAgo(ago(60 * DAY), NOW);
    expect(out).not.toMatch(/ago/);
    expect(out).toMatch(/\w{3}\s\d{1,2}/); // e.g. "Apr 14"
  });

  it("should treat a future timestamp as 'just now', never negative (edge case)", () => {
    expect(timeAgo(new Date(NOW.getTime() + 5 * MIN).toISOString(), NOW)).toBe(
      "just now",
    );
  });

  it("should return '' for an invalid timestamp (error path)", () => {
    expect(timeAgo("not-a-date", NOW)).toBe("");
  });
});

describe("absoluteTime", () => {
  it("should produce a non-empty string for a valid timestamp (happy path)", () => {
    expect(absoluteTime(ago(HOUR)).length).toBeGreaterThan(0);
  });

  it("should return '' for an invalid timestamp (error path)", () => {
    expect(absoluteTime("nope")).toBe("");
  });
});
