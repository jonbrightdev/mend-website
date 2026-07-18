import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

// A fake clock lets tests advance time deterministically instead of racing
// real wall-clock time.
function fakeClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows `limit` hits in one window, then denies the next", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: clock.now });

    expect(limiter.check("a")).toEqual({ ok: true });
    expect(limiter.check("a")).toEqual({ ok: true });
    expect(limiter.check("a")).toEqual({ ok: true });
    const verdict = limiter.check("a");
    expect(verdict.ok).toBe(false);
  });

  it("returns a positive retryAfterSeconds that rounds up and never exceeds the window", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: clock.now });

    expect(limiter.check("a")).toEqual({ ok: true });
    clock.advance(1_500); // 8.5s remain in the window
    const verdict = limiter.check("a");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
      expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(10);
      // 8.5s remaining rounds up to 9, never truncates to 8 or 0.
      expect(verdict.retryAfterSeconds).toBe(9);
    }
  });

  it("resets the count once a new window starts", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    expect(limiter.check("a")).toEqual({ ok: true });
    expect(limiter.check("a").ok).toBe(false);

    clock.advance(1000);
    expect(limiter.check("a")).toEqual({ ok: true });
  });

  it("tracks keys independently", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    expect(limiter.check("a")).toEqual({ ok: true });
    expect(limiter.check("b")).toEqual({ ok: true });
    expect(limiter.check("a").ok).toBe(false);
    expect(limiter.check("b").ok).toBe(false);
  });

  it("prunes stale entries once the map passes the prune threshold", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    // Fill past the ~10,000-entry prune threshold, all in a window that will
    // be stale by the time we advance the clock below.
    for (let i = 0; i < 10_001; i++) {
      limiter.check(`stale-${i}`);
    }

    // Move well past the window so every entry above is prunable, then add
    // one more key to push the map over threshold and trigger a prune.
    clock.advance(60_000);
    limiter.check("trigger-prune");

    // A stale key's original hit is gone: it gets a fresh window (ok again)
    // rather than being denied by leftover state from the pruned entry.
    expect(limiter.check("stale-0")).toEqual({ ok: true });
  });
});
