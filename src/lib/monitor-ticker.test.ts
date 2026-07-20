import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMonitorTicker } from "@/lib/monitor-ticker";
import type { MonitorTarget } from "@/lib/monitor-queries";

// Everything here runs on injected fakes and fake timers — no database, no
// browser. The ticker's job is ordering and isolation, and that is what these
// assert.

function target(id: string): MonitorTarget {
  return { id, userId: "u", url: `https://example.com/${id}` };
}

// Keeps console.error from making a passing suite look broken; the error paths
// below deliberately log.
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  errorSpy.mockRestore();
});

describe("createMonitorTicker", () => {
  it("runs every claimed monitor", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const ticker = createMonitorTicker({
      claim: async () => [target("a"), target("b")],
      run,
    });

    await ticker.tick();

    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((c) => (c[0] as MonitorTarget).id)).toEqual(["a", "b"]);
  });

  it("ticks once immediately on start, for boot catch-up", async () => {
    const claim = vi.fn().mockResolvedValue([]);
    const ticker = createMonitorTicker({ claim, run: vi.fn() });

    ticker.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(claim).toHaveBeenCalledTimes(1);
    ticker.stop();
  });

  it("ticks again on each interval", async () => {
    const claim = vi.fn().mockResolvedValue([]);
    const ticker = createMonitorTicker({ claim, run: vi.fn(), intervalMs: 1000 });

    ticker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(claim).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(claim).toHaveBeenCalledTimes(4);

    ticker.stop();
  });

  it("stops ticking after stop()", async () => {
    const claim = vi.fn().mockResolvedValue([]);
    const ticker = createMonitorTicker({ claim, run: vi.fn(), intervalMs: 1000 });

    ticker.start();
    await vi.advanceTimersByTimeAsync(0);
    ticker.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("runs monitors sequentially, never in parallel", async () => {
    // One Chromium at a time is the memory budget, so the second run must not
    // begin until the first has resolved.
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const run = vi.fn(async (t: MonitorTarget) => {
      order.push(`start:${t.id}`);
      if (t.id === "a") await first;
      order.push(`end:${t.id}`);
    });

    const ticker = createMonitorTicker({
      claim: async () => [target("a"), target("b")],
      run,
    });

    const done = ticker.tick();
    await vi.advanceTimersByTimeAsync(0);

    // "b" has not started while "a" is still in flight.
    expect(order).toEqual(["start:a"]);

    releaseFirst();
    await done;

    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });

  it("skips a tick that fires while a batch is still running", async () => {
    let release: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const claim = vi.fn().mockResolvedValue([target("slow")]);
    const ticker = createMonitorTicker({
      claim,
      run: () => inFlight,
      intervalMs: 1000,
    });

    ticker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(claim).toHaveBeenCalledTimes(1);

    // Several intervals elapse while the first batch is still scanning.
    await vi.advanceTimersByTimeAsync(3000);
    expect(claim).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(claim).toHaveBeenCalledTimes(2);

    ticker.stop();
  });

  it("keeps going when one run throws", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("chromium failed to launch"))
      .mockResolvedValue(undefined);

    const ticker = createMonitorTicker({
      claim: async () => [target("bad"), target("good")],
      run,
    });

    await expect(ticker.tick()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("survives a claim failure and ticks again next interval", async () => {
    const claim = vi
      .fn()
      .mockRejectedValueOnce(new Error("database unreachable"))
      .mockResolvedValue([]);
    const ticker = createMonitorTicker({ claim, run: vi.fn(), intervalMs: 1000 });

    ticker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(claim).toHaveBeenCalledTimes(1);

    // The interval must survive the rejection.
    await vi.advanceTimersByTimeAsync(1000);
    expect(claim).toHaveBeenCalledTimes(2);

    ticker.stop();
  });

  it("releases the running flag after a failed tick", async () => {
    const claim = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([target("a")]);
    const run = vi.fn().mockResolvedValue(undefined);
    const ticker = createMonitorTicker({ claim, run });

    await ticker.tick();
    await ticker.tick();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("passes the batch limit through to the claim", async () => {
    const claim = vi.fn().mockResolvedValue([]);
    const ticker = createMonitorTicker({ claim, run: vi.fn(), batchLimit: 5 });

    await ticker.tick();

    expect(claim).toHaveBeenCalledWith(expect.any(Date), 5);
  });

  it("start() is idempotent", async () => {
    const claim = vi.fn().mockResolvedValue([]);
    const ticker = createMonitorTicker({ claim, run: vi.fn(), intervalMs: 1000 });

    ticker.start();
    ticker.start();
    await vi.advanceTimersByTimeAsync(2000);

    // Two intervals, not four: the second start() was a no-op.
    expect(claim).toHaveBeenCalledTimes(3);
    ticker.stop();
  });
});
