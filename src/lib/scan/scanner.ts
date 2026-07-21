/* ============================================================
   Headless-Chromium scan: load a page, run axe-core in it, and
   return a payload in the exact shape /api/ingest accepts.

   playwright-core (not "playwright") on purpose: the fat package
   downloads its own browsers in a postinstall step, which does not
   survive Railway's Nixpacks build. We launch the system Chromium
   instead — see nixpacks.toml.

   axe-core's source is inlined at build time via Vite's ?raw
   import, so the running server never reads node_modules.
   ============================================================ */

import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { chromium } from "playwright-core";
import axeSource from "axe-core/axe.min.js?raw";
import { parsePayload, type IngestPayload } from "@/lib/ingest-payload";
import { axeToIssues, type AxeViolation } from "@/lib/scan/normalize";
import { assertScannableUrl } from "@/lib/scan/url-guard";

const NAV_TIMEOUT_MS = 45_000;
// A human running the extension does it after the page has settled; give
// late-loading widgets the same courtesy before asking axe what it sees.
const SETTLE_MS = 1_000;
const VIEWPORT = { width: 1280, height: 800 };

// Self-identifying, so a site owner who sees us in their logs can find out who
// we are and how to stop us.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 MendMonitor/1.0 (+https://mend-a11y.com/support)";

let cachedPathLookup: string | undefined;

/**
 * The Chromium binary to launch: CHROMIUM_PATH, else the first `chromium`
 * found on PATH.
 *
 * Playwright checks this value with a plain `fs.access` before spawning it —
 * unlike a shell, it does not search PATH for a bare command name — so
 * returning the literal string "chromium" resolves against
 * `process.cwd()` and never matches the Nixpacks-installed binary. Walk
 * PATH ourselves instead, the same as a shell would.
 */
export function chromiumPath(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (cachedPathLookup) return cachedPathLookup;

  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, "chromium");
    if (existsSync(candidate)) {
      cachedPathLookup = candidate;
      return candidate;
    }
  }

  // Nothing found on PATH: return the bare name so Playwright's own
  // "doesn't exist at chromium" error still fires, naming the exact path
  // it tried rather than us swallowing the lookup failure silently.
  return "chromium";
}

/**
 * Scans one page and returns a validated ingest payload.
 *
 * The returned `url` is the *requested* one, not the post-redirect address:
 * the monitor row and its audit rows are joined on that url, and a site that
 * redirects would otherwise scatter one page's history across two entries.
 */
export async function scanPage(url: string): Promise<IngestPayload> {
  assertScannableUrl(url);
  return withCrashRetry(url, runScan);
}

/**
 * Validates one URL from a redirect chain. Returns null when the hop is
 * allowed, or a user-readable reason when it is not.
 *
 * Separate from the Playwright wiring so the decision can be unit tested
 * without launching a browser — same reason withCrashRetry is split out.
 */
export function checkRedirectHop(url: string): string | null {
  try {
    assertScannableUrl(url);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "That address cannot be scanned.";
  }
}

/**
 * Matches a Chromium *renderer* crash, as opposed to an ordinary scan failure
 * (navigation timeout, DNS, TLS). The renderer dying is a different class of
 * problem: nothing about the request was wrong, the browser process itself
 * went away mid-page.
 */
export function isRendererCrash(e: unknown): boolean {
  const message = e instanceof Error && e.message ? e.message : String(e);
  return /page crashed|target crashed|browser has disconnected/i.test(message);
}

/**
 * Runs `attempt`, and on a renderer crash runs it exactly once more.
 *
 * A crash is usually memory pressure — the container ran out while laying out
 * a heavy page — and it is frequently transient, so a second try on a fresh
 * browser often succeeds and costs one page load. Crashing twice in a row is a
 * real limit rather than a blip, and earns an error an operator can act on
 * instead of Playwright's raw "Page crashed", which reads like a bug in Mend.
 *
 * Separated from the browser work so it can be tested without launching one.
 */
export async function withCrashRetry<T>(url: string, attempt: (url: string) => Promise<T>): Promise<T> {
  try {
    return await attempt(url);
  } catch (first) {
    if (!isRendererCrash(first)) throw first;
    console.warn(`scan: renderer crashed on ${url}, retrying once`);

    try {
      return await attempt(url);
    } catch (second) {
      if (!isRendererCrash(second)) throw second;
      throw new Error(
        "The browser crashed twice while rendering this page, which usually means the page exceeded the scanner's memory limit. Very script-heavy pages can do this.",
      );
    }
  }
}

/**
 * The browser work, without the SSRF guard.
 *
 * Exported **only** for the env-gated e2e test, which must scan a fixture
 * server on 127.0.0.1 — an address `scanPage` refuses by design. Never call
 * this from application code: `scanPage` is the entry point, and the guard is
 * the reason it exists.
 */
export async function scanFixtureForTest(url: string): Promise<IngestPayload> {
  return runScan(url);
}

async function runScan(url: string): Promise<IngestPayload> {
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    headless: true,
    // The Railway container has no user namespace for Chromium's sandbox, so
    // it cannot start with it enabled. Acceptable because the only thing this
    // browser ever does is load a page and read axe's findings — but if
    // Railway ever supports user-namespace sandboxing, drop this.
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const startedAt = Date.now();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();

    // page.goto follows redirects inside Chromium, so the guard that ran on the
    // submitted URL never sees the addresses we actually end up fetching.
    // Record any hop that fails the same check and fail the scan afterwards — a
    // public URL that 302s to 169.254.169.254 must not be scannable.
    //
    // Held in an array rather than a `let` because TypeScript keeps the
    // initializer's narrowing for a variable only assigned inside a closure,
    // which would make the check below look unreachable.
    const blockedHops: { url: string; reason: string }[] = [];
    page.on("response", (response) => {
      if (blockedHops.length > 0) return;
      const status = response.status();
      if (status < 300 || status > 399) return;
      const location = response.headers().location;
      if (!location) return;

      let next: string;
      try {
        // Location may be relative, and on the second hop of a chain it is
        // relative to *that* hop — so resolve against the responding URL.
        next = new URL(location, response.url()).toString();
      } catch {
        // An unparseable Location is one Chromium cannot follow either, so
        // there is no request here to guard against.
        return;
      }

      const reason = checkRedirectHop(next);
      if (reason) blockedHops.push({ url: next, reason });
    });

    await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });

    // Checked here rather than thrown from the handler: throwing inside a
    // Playwright event listener does not reject goto — it becomes an unhandled
    // rejection and the scan carries on regardless.
    const blocked = blockedHops[0];
    if (blocked) {
      throw new Error(`This page redirected to an address Mend will not load. ${blocked.reason}`);
    }

    await page.waitForTimeout(SETTLE_MS);

    const pageTitle = await page.title();

    await page.addScriptTag({ content: axeSource });
    const results = await page.evaluate(async () => {
      // axe is attached to the page's window by the script tag above.
      const axe = (window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<unknown> } }).axe;
      return (await axe.run(document, { resultTypes: ["violations"] })) as {
        violations: AxeViolation[];
        passes?: unknown[];
      };
    });

    const violations = results.violations ?? [];

    // parsePayload is the ingest contract. Running our own output through it
    // means the scanner can never produce something the route would reject —
    // a divergence would fail here rather than silently store a bad row.
    return parsePayload({
      url,
      pageTitle,
      startedAt,
      durationMs: Date.now() - startedAt,
      // resultTypes: ["violations"] means axe returns full detail only for
      // violations; passes still arrive as a (thin) array, so the sum is the
      // honest count of rules that produced a result.
      totalChecks: results.passes ? violations.length + results.passes.length : undefined,
      partial: false,
      issues: axeToIssues(violations),
    });
  } finally {
    // Always — a leaked Chromium on a single-node deploy is a memory leak that
    // outlives the request.
    await browser.close();
  }
}
