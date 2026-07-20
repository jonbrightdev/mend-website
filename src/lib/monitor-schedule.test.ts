import { describe, expect, it } from "vitest";
import { initialRunAt, nextRunAt } from "@/lib/monitor-schedule";

const DAY_MS = 24 * 60 * 60 * 1000;

// rand() is exclusive of 1, so the largest value the generator can realistically
// produce is used as the upper-bound probe rather than 1 itself.
const NEARLY_ONE = 0.9999999999;

describe("initialRunAt", () => {
  it("lands strictly after now, and no later than 24 hours out", () => {
    const now = new Date("2026-07-20T09:30:00.000Z");

    const earliest = initialRunAt(now, () => 0);
    const latest = initialRunAt(now, () => NEARLY_ONE);

    expect(earliest.getTime()).toBeGreaterThan(now.getTime());
    expect(latest.getTime()).toBeLessThanOrEqual(now.getTime() + DAY_MS);
  });

  it("spreads proportionally across the window", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    const mid = initialRunAt(now, () => 0.5);
    expect(mid.getTime() - now.getTime()).toBeCloseTo(DAY_MS / 2, -3);
  });
});

describe("nextRunAt", () => {
  it("lands inside tomorrow's UTC day", () => {
    const now = new Date("2026-07-20T09:30:00.000Z");

    expect(nextRunAt(now, () => 0).toISOString()).toBe("2026-07-21T00:00:00.000Z");
    expect(nextRunAt(now, () => NEARLY_ONE).toISOString()).toBe(
      "2026-07-21T23:59:59.999Z",
    );
  });

  // The reason nextRunAt anchors to the calendar day rather than now + 24h:
  // a run finishing a millisecond before midnight must still schedule into
  // tomorrow, not skip it.
  it("still schedules into tomorrow when now is the last instant of the day", () => {
    const now = new Date("2026-07-20T23:59:59.999Z");
    expect(nextRunAt(now, () => 0).toISOString()).toBe("2026-07-21T00:00:00.000Z");
  });

  it("rolls over month and year boundaries", () => {
    expect(nextRunAt(new Date("2026-07-31T12:00:00.000Z"), () => 0).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
    expect(nextRunAt(new Date("2026-12-31T12:00:00.000Z"), () => 0).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("is always in the future relative to now", () => {
    const now = new Date("2026-07-20T23:00:00.000Z");
    for (const r of [0, 0.25, 0.5, 0.75, NEARLY_ONE]) {
      expect(nextRunAt(now, () => r).getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
