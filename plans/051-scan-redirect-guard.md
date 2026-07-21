# Plan 051: Re-validate every redirect hop against the SSRF guard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9930443..HEAD -- src/lib/scan/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9930443`, 2026-07-21

## Why this matters

The monitor feature loads user-supplied URLs *from Mend's own server* using a
real headless Chromium. `assertScannableUrl` exists to stop that being pointed
at internal addresses — cloud metadata (`169.254.169.254`), loopback, RFC1918.
It runs **once**, on the URL the user submitted, and then `page.goto` hands
navigation to Chromium, which follows HTTP redirects natively. The guard never
runs again.

So a monitor pointed at an attacker-controlled *public* URL that responds `302
Location: http://169.254.169.254/...` reaches that address. Any registered user
can add a monitor, and once `MONITOR_SCHEDULER_ENABLED` is turned on this runs
unattended every day.

**This is not the gap the code already documents.** `src/lib/scan/url-guard.ts`
has a header comment accepting *DNS rebinding* (a hostname resolving to a
private address) as an out-of-scope v1 limitation. Redirect-following is a
different and much cheaper attack — it needs only a public HTTP server, no DNS
control. Do not read that comment as covering this.

After this plan, every hop in a redirect chain is validated with the same rules
as the initial URL, and a blocked hop produces a clear error instead of a
successful scan of an internal service.

## Current state

Files in play:

- `src/lib/scan/scanner.ts` — launches Chromium and navigates. Contains the gap.
- `src/lib/scan/url-guard.ts` — the guard. Correct, and **not** changing in this plan.
- `src/lib/scan/scanner.test.ts` — unit tests that run without a browser.
- `src/lib/scan/scanner.e2e.test.ts` — the only test that launches a real browser; self-skips unless `MONITOR_E2E=1`.

The guard is applied exactly once, at `src/lib/scan/scanner.ts:71-74`:

```ts
export async function scanPage(url: string): Promise<IngestPayload> {
  assertScannableUrl(url);
  return withCrashRetry(url, runScan);
}
```

And navigation happens with no interception, at `src/lib/scan/scanner.ts:147`
(inside `runScan`):

```ts
    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: USER_AGENT,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
```

There is no `page.route(...)`, no `page.on("request"/"response")`, and no
`maxRedirects` anywhere in `src/lib/scan/` — verified by grep.

The guard's signature, which you will reuse unchanged
(`src/lib/scan/url-guard.ts:68`):

```ts
/**
 * Throws with user-readable copy unless `url` is a public http(s) address we
 * are willing to point a browser at. Returns the parsed URL on success.
 */
export function assertScannableUrl(url: string): URL
```

It throws `Error` with user-readable copy; it does not return a boolean.

### Conventions this repo uses — match them

- **Comments explain *why*, not *what*.** Every non-obvious decision in
  `src/lib/scan/` carries a comment giving its reason. Match that density.
  See the `--no-sandbox` comment at `scanner.ts:92-96` for the house style.
- **Errors that are a scan *result* must not throw past `runMonitor`.**
  `src/lib/run-monitor.ts` catches everything from `scanPage` and records it in
  `monitor.lastError`, returning `{ ok, error }`. A blocked redirect is exactly
  this kind of result. You do **not** need to change `run-monitor.ts` — just
  make sure your new failure path throws a normal `Error` from `scanPage`, so
  the existing catch records it.
- **Testable logic is separated from browser work.** `withCrashRetry` in
  `scanner.ts` is a pure higher-order function specifically so it can be unit
  tested without launching Chromium. Follow the same shape: put the
  hop-checking decision in a pure exported function, and wire it to Playwright
  separately.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Generate routes | `pnpm generate-routes` | exit 0 (warnings about `.test.ts` route files are normal) |
| Typecheck | `pnpm typecheck` | exit 0, no errors |
| Lint | `pnpm lint` | exit 0 |
| Unit tests (this area) | `pnpm vitest run src/lib/scan/` | all pass |
| Full suite | `pnpm test` | all pass (528 passing at plan time) |
| Build | `pnpm build` | exit 0 |

Run `nvm use` first — `.nvmrc` pins Node 24.

## Scope

**In scope** (the only files you should modify):

- `src/lib/scan/scanner.ts`
- `src/lib/scan/scanner.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/scan/url-guard.ts` — the guard's *rules* are correct and separately
  tested. This plan changes *how often* it is applied, never what it allows.
  Do not add a DNS-resolution check here; that is the deliberate v1 limitation
  documented in that file's header, and changing it affects intranet-hosted
  staging monitors, which is a product decision nobody has made.
- `src/lib/run-monitor.ts` — already handles a thrown scan error correctly.
- `src/lib/scan/scanner.e2e.test.ts` — needs a real browser and is skipped in
  CI; adding to it will not be run and gives false confidence.
- `src/lib/monitor-queries.ts` / `monitor-fns.ts` — the create-time guard call
  there is correct and unrelated.

## Git workflow

- Work directly on `main` — this repo does not use feature branches (see
  `CLAUDE.md`). Do not open a PR.
- Commit message style: imperative subject, blank line, prose body explaining
  *why*. Recent example: `Add security headers to every response`.
- Do **not** push. Leave the commit local for review.

## Steps

### Step 1: Add a pure hop-checking function

In `src/lib/scan/scanner.ts`, export a function that decides whether a
redirect chain is acceptable. Keep it pure — no Playwright types, no browser.

Target shape:

```ts
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
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Enforce the check on every navigation response

In `runScan` in `src/lib/scan/scanner.ts`, after `context.newPage()` and
**before** `page.goto(...)`, register a listener that inspects every
navigation response and aborts the scan when a hop is blocked.

Playwright surfaces redirects as responses with 3xx status codes. Record the
first blocked hop in a local variable, then check it after `page.goto` returns
and throw.

Target shape:

```ts
    const page = await context.newPage();

    // page.goto follows redirects inside Chromium, so the guard that ran on
    // the submitted URL never sees the addresses we actually end up fetching.
    // Record any hop that fails the same check and fail the scan afterwards —
    // a public URL that 302s to 169.254.169.254 must not be scannable.
    let blockedHop: { url: string; reason: string } | null = null;
    page.on("response", (response) => {
      if (blockedHop) return;
      const status = response.status();
      if (status < 300 || status > 399) return;
      const location = response.headers()["location"];
      if (!location) return;
      // Location may be relative; resolve against the URL that produced it.
      const next = new URL(location, response.url()).toString();
      const reason = checkRedirectHop(next);
      if (reason) blockedHop = { url: next, reason };
    });

    await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });

    if (blockedHop) {
      throw new Error(
        `This page redirected to an address Mend will not load. ${blockedHop.reason}`,
      );
    }

    await page.waitForTimeout(SETTLE_MS);
```

Two details that matter:

- Resolve `location` against `response.url()`, not against the original URL —
  a relative `Location` on the second hop of a chain would otherwise resolve
  wrongly.
- Check `blockedHop` **after** `page.goto` resolves, not inside the listener.
  Throwing from inside a Playwright event handler does not reject `goto`; it
  becomes an unhandled rejection and the scan proceeds.

**Verify**: `pnpm typecheck` → exit 0, and `pnpm lint` → exit 0.

### Step 3: Unit-test the hop decision

Add a `describe("checkRedirectHop")` block to
`src/lib/scan/scanner.test.ts`, following the existing structure in that file
(it already has `describe` blocks for `chromiumPath`, `isRendererCrash` and
`withCrashRetry`, each importing from `@/lib/scan/scanner` with a dynamic
`await import(...)` because the module memoizes state between tests — keep
using that dynamic-import idiom).

Cases to cover:

1. A normal public URL returns `null` (allowed).
2. `http://169.254.169.254/latest/meta-data/` returns a non-null string.
3. `http://127.0.0.1:3000/` returns a non-null string.
4. `http://10.0.0.5/` returns a non-null string.
5. A non-http scheme such as `file:///etc/hosts` returns a non-null string.

**Verify**: `pnpm vitest run src/lib/scan/scanner.test.ts` → all pass,
including 5 new tests.

### Step 4: Full gate

**Verify**, in order, all exit 0:

```
pnpm generate-routes
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test` must show **no fewer** passing tests than before your change plus
your 5 new ones.

## Test plan

- **New tests**: 5 cases in `src/lib/scan/scanner.test.ts` under a new
  `describe("checkRedirectHop")` block, as listed in Step 3.
- **Structural pattern to follow**: the existing `describe("withCrashRetry")`
  block in the same file — same dynamic `await import("@/lib/scan/scanner")`,
  same `expect(...)` style.
- **Not tested here**: the Playwright listener itself. Exercising a real
  redirect needs a browser, and the browser test is skipped in CI. The pure
  function carries the security decision; the listener is thin wiring. This is
  a deliberate trade, not an oversight — see Maintenance notes.
- **Verification**: `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0, with 5 new passing tests in `src/lib/scan/scanner.test.ts`
- [ ] `pnpm build` exits 0
- [ ] `grep -n "page.on(\"response\"" src/lib/scan/scanner.ts` returns exactly one match
- [ ] `grep -n "checkRedirectHop" src/lib/scan/scanner.ts` returns at least two matches (definition + use)
- [ ] `git status --short` shows only `src/lib/scan/scanner.ts`, `src/lib/scan/scanner.test.ts` and `plans/README.md` modified
- [ ] `plans/README.md` status row for 051 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code — in particular if
  `scanPage` no longer calls `assertScannableUrl`, or if `runScan` already
  registers a `page.on` / `page.route` handler. Someone else has changed this
  area and the two changes may conflict.
- `pnpm test` shows failures in files you did not touch. The scan modules are
  imported by `run-monitor` and the monitor tests; a failure there means the
  throw is escaping somewhere it shouldn't.
- You conclude the fix needs `src/lib/scan/url-guard.ts` to change. It should
  not — if it seems to, the reasoning has gone wrong somewhere, and changing
  the guard's rules is explicitly out of scope.
- Adding the response listener makes an ordinary same-site `http` → `https`
  redirect fail. That is a legitimate hop and must still work; if your check
  blocks it, stop rather than loosening the guard to compensate.

## Maintenance notes

For whoever owns this next:

- **The listener is untested by automation.** If you change the redirect
  handling, exercise it manually: point a monitor at a URL that 302s to
  `http://127.0.0.1/` and confirm the run records an error rather than
  succeeding. The `MONITOR_E2E=1` e2e test is the natural home for an
  automated version if someone wires a redirecting fixture server.
- **DNS rebinding is still open**, deliberately. `url-guard.ts`'s header
  documents why (intranet-hosted staging monitors). This plan does not change
  that, and closing it is a separate product decision.
- **Interaction with `MONITOR_SCHEDULER_ENABLED`**: this plan is the reason to
  feel comfortable turning that flag on. Land it first.
- A reviewer should check exactly two things: that `blockedHop` is inspected
  *after* `await page.goto` (not thrown from inside the handler), and that
  relative `Location` headers resolve against `response.url()`.
