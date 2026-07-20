/* ============================================================
   The only test that needs a real browser. Self-skips unless
   MONITOR_E2E=1, so CI (which has no Chromium) stays green:

     MONITOR_E2E=1 CHROMIUM_PATH=/path/to/chromium \
       pnpm vitest run src/lib/scan/scanner.e2e.test.ts

   It serves a deliberately broken page from localhost and scans
   it — which is also why it must bypass the SSRF guard's own
   rules by pointing at 127.0.0.1 through an explicit override.
   ============================================================ */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ENABLED = process.env.MONITOR_E2E === "1";

// Two guaranteed axe violations: an image with no alt text, and an input with
// no accessible name.
const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <head><title>Broken Fixture</title></head>
  <body>
    <h1>Fixture</h1>
    <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
    <input type="text">
  </body>
</html>`;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  if (!ENABLED) return;
  server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  if (!ENABLED || !server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe.skipIf(!ENABLED)("scanPage (real Chromium)", () => {
  it("finds the fixture's known violations and returns a valid payload", async () => {
    // scanPage refuses loopback by design, so the browser work is exercised
    // directly here against the fixture server. The guard itself has its own
    // suite (url-guard.test.ts) and is asserted separately below.
    const { scanFixtureForTest } = await import("@/lib/scan/scanner");
    const payload = await scanFixtureForTest(baseUrl);

    expect(payload.pageTitle).toBe("Broken Fixture");
    expect(payload.url).toBe(baseUrl);
    expect(payload.partial).toBe(false);
    expect(payload.durationMs).toBeGreaterThan(0);

    const ruleIds = new Set(payload.issues.map((i) => i.ruleId));
    expect(ruleIds.has("image-alt")).toBe(true);
    expect(ruleIds.size).toBeGreaterThanOrEqual(2);

    // Every issue must already satisfy the ingest contract.
    for (const issue of payload.issues) {
      expect(issue.selector.length).toBeGreaterThan(0);
      expect(["critical", "serious", "moderate", "minor"]).toContain(issue.impact);
    }
  }, 90_000);

  it("still refuses a private address through the public entry point", async () => {
    const { scanPage } = await import("@/lib/scan/scanner");
    await expect(scanPage(baseUrl)).rejects.toThrow(/private or local network/i);
  });
});
