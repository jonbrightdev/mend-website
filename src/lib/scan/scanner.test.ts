/* ============================================================
   Unit coverage for chromiumPath's PATH resolution — the piece that
   broke in production. Playwright checks the executablePath with a
   plain fs.access, not a shell-style PATH search, so a bare
   "chromium" only ever resolves against process.cwd(). chromiumPath
   must do the PATH walk itself.

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
