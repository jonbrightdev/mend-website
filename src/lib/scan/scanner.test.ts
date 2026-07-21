/* ============================================================
   Unit coverage for the two scanner pieces that can be exercised
   without launching a browser: chromiumPath's PATH resolution and
   the renderer-crash retry.

   chromiumPath is the piece that broke in production. Playwright
   checks the executablePath with a plain fs.access, not a
   shell-style PATH search, so a bare "chromium" only ever resolves
   against process.cwd(). chromiumPath must do the PATH walk itself.

   Each test resets modules to get a fresh, uncached import: the real
   function memoizes a successful PATH lookup, which would otherwise
   leak between tests that set different PATH values.
   ============================================================ */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("chromiumPath", () => {
  it("prefers CHROMIUM_PATH when set, without touching PATH", async () => {
    process.env.CHROMIUM_PATH = "/opt/custom/chromium";
    process.env.PATH = "/nonexistent-should-not-be-read";

    const { chromiumPath } = await import("@/lib/scan/scanner");
    expect(chromiumPath()).toBe("/opt/custom/chromium");
  });

  it("resolves a bare \"chromium\" against a real PATH entry", async () => {
    delete process.env.CHROMIUM_PATH;
    const dir = mkdtempSync(join(tmpdir(), "chromium-path-"));
    const binary = join(dir, "chromium");
    writeFileSync(binary, "");

    process.env.PATH = [dir, "/usr/bin"].join(":");

    const { chromiumPath } = await import("@/lib/scan/scanner");
    expect(chromiumPath()).toBe(binary);
  });

  it("falls back to the bare name when nothing on PATH matches", async () => {
    delete process.env.CHROMIUM_PATH;
    const dir = mkdtempSync(join(tmpdir(), "chromium-path-empty-"));
    process.env.PATH = dir;

    const { chromiumPath } = await import("@/lib/scan/scanner");
    expect(chromiumPath()).toBe("chromium");
  });
});

describe("isRendererCrash", () => {
  it("matches the crash messages Playwright actually produces", async () => {
    const { isRendererCrash } = await import("@/lib/scan/scanner");
    expect(isRendererCrash(new Error("page.goto: Page crashed"))).toBe(true);
    expect(isRendererCrash(new Error("Target crashed"))).toBe(true);
    expect(isRendererCrash(new Error("Browser has disconnected"))).toBe(true);
  });

  it("does not match ordinary scan failures", async () => {
    const { isRendererCrash } = await import("@/lib/scan/scanner");
    // These must stay distinguishable: a timeout means the *page* is at fault
    // and the message is already useful, so retrying just doubles the wait.
    expect(isRendererCrash(new Error("page.goto: Timeout 45000ms exceeded"))).toBe(false);
    expect(isRendererCrash(new Error("net::ERR_NAME_NOT_RESOLVED"))).toBe(false);
  });
});

describe("withCrashRetry", () => {
  const crash = () => new Error("page.goto: Page crashed");

  it("does not retry a run that succeeds", async () => {
    const { withCrashRetry } = await import("@/lib/scan/scanner");
    const attempt = vi.fn().mockResolvedValue("payload");

    await expect(withCrashRetry("https://example.com/", attempt)).resolves.toBe("payload");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries once after a crash and returns the second result", async () => {
    const { withCrashRetry } = await import("@/lib/scan/scanner");
    const attempt = vi.fn().mockRejectedValueOnce(crash()).mockResolvedValue("payload");

    await expect(withCrashRetry("https://example.com/", attempt)).resolves.toBe("payload");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("replaces a second crash with an operator-readable error", async () => {
    const { withCrashRetry } = await import("@/lib/scan/scanner");
    const attempt = vi.fn().mockRejectedValue(crash());

    await expect(withCrashRetry("https://example.com/", attempt)).rejects.toThrow(/memory limit/i);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-crash failure immediately, without a second attempt", async () => {
    const { withCrashRetry } = await import("@/lib/scan/scanner");
    const attempt = vi.fn().mockRejectedValue(new Error("page.goto: Timeout 45000ms exceeded"));

    await expect(withCrashRetry("https://example.com/", attempt)).rejects.toThrow(/Timeout/);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
