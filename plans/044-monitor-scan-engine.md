# Plan 044: Server-side scan engine — headless Chromium + axe-core → audit rows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a0f7690..HEAD -- src/routes/api/ingest.ts src/lib/ingest-payload.ts src/db/schema.ts`
> Plan 043 must be DONE (this plan writes `monitor.lastRunAt`/`lastError`).
> Plan 039 (billing) also edits the ingest route — see STOP conditions.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MEDIUM (headless Chromium on Railway is the one genuinely new
  infrastructure piece; everything else is pure code with tests)
- **Depends on**: 043
- **Category**: feature — monitoring generation (043 → 044 → 045)
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

Plan 043 stores *what* to monitor; this plan makes the server able to
actually audit a page: load it in headless Chromium, run axe-core, normalize
the results into the **exact flat-issue shape the extension sends to
`/api/ingest`**, and store them through the **same parsing/grouping/storage
path** — so a monitor run is indistinguishable from an extension run to the
dashboard, detail pages, export, and the VPAT report (plan 046). It also adds
a **"Run now"** action to `/monitors`, which is both real user value and the
manual verification hook for this plan and the deploy.

Inspiration: har-analyzer's capture service (scheduled scans "launch their own
headless browser", `CAPTURE_SANDBOX` toggle) and the mend-a11y extension's
normalize pipeline, whose tiny pure helpers (`wcagFromTags`, category
mapping) we mirror so both scanners emit the same vocabulary.

## Design decisions (settled — do not re-litigate)

- **Real browser, not jsdom.** axe-core in jsdom has no layout/CSSOM, so
  color-contrast and geometry rules silently degrade — monitor results would
  diverge from extension results *on the same dashboard*. Rejected.
- **`playwright-core` + system Chromium**, not the fat `playwright` package:
  no postinstall browser download to keep working under Railway's Nixpacks.
  The executable comes from `CHROMIUM_PATH` env, falling back to `chromium`
  on `PATH` (which is where a Nixpacks `nixPkgs = ["chromium"]` entry puts
  it). Locally, point `CHROMIUM_PATH` at any installed Chrome/Chromium.
- **axe-core injected from our own dependency** (`pnpm add axe-core`,
  `import axeSource from "axe-core/axe.min.js?raw"` so Vite inlines the
  source string into the server bundle — no runtime `node_modules` reads).
  The extension pins `axe-core ^4.11.0`; pin the same major.
- **Reuse, don't re-implement, ingest**: the route's storage transaction is
  extracted to `src/lib/audit-store.ts` and called by both the route and the
  scanner. The scanner's output goes through `parsePayload` too — one
  validation contract, one grouping (`groupViolations`), one idempotency
  rule.
- **SSRF stance**: monitors fetch user-supplied URLs from our server. v1
  guard: require `http(s)`, and refuse hostnames that are IP literals in
  private/loopback/link-local ranges plus `localhost`. DNS-rebinding-grade
  defenses are out of scope (documented in Maintenance notes); the page load
  happens in a browser sandbox, and the response body is never returned to
  the user — only axe results are.
- **Per-run budget**: 60 s navigation+scan timeout; viewport 1280×800;
  `waitUntil: "load"` plus a short settle delay (1 s) — matching a human
  running the extension after page load.

## Current state

- `src/routes/api/ingest.ts` — POST handler; the storage transaction at
  lines ~145-178 inserts `audit` (`onConflictDoNothing` on
  `(userId, url, scannedAt)`) then `groupViolations(...)` →
  `violation` rows, returning `{duplicate}` or `{auditId, count}`.
- `src/lib/ingest-payload.ts` — `parsePayload` (validation, caps) and
  `groupViolations`; `IngestIssue` is the flat shape:
  `{ ruleId, impact, category, wcag, title, description, helpUrl?, selector,
  html, failureSummary?, domOrder }`.
- mend-a11y normalize (`../mend-a11y/src/lib/normalize.ts`):
  `wcagFromTags` turns axe tags `wcag143` → `"1.4.3"` (regex
  `^wcag(\d)(\d)(\d+)$`); a `TAG_CATEGORY` map turns axe `cat.*` tags into a
  category string; missing impact falls back to `"minor"`. Mirror these
  behaviors (do **not** import across repos).
- `railway.json` — Nixpacks builder, `pnpm build`, start
  `node .output/server/index.mjs`. No `nixpacks.toml` exists yet.
- Plan 043's `monitor` table: `lastRunAt`, `lastError`, `nextRunAt`,
  `pausedAt`.

## Commands you will need

| Purpose   | Command                                    | Expected |
|-----------|--------------------------------------------|----------|
| Add deps  | `pnpm add playwright-core axe-core`        | lockfile updated, exact-pinned nitro untouched |
| Typecheck | `pnpm typecheck`                           | exit 0   |
| Tests     | `pnpm test`                                | all pass |
| Live scan | `MONITOR_E2E=1 CHROMIUM_PATH=… pnpm test src/lib/scan/scanner.e2e.test.ts` | passes locally |
| Lint/Build| `pnpm lint && pnpm build`                  | exit 0   |

## Scope

**In scope**:
- `package.json` (+lockfile): `playwright-core`, `axe-core`
- `src/lib/audit-store.ts` (extracted transaction) + route refactor in
  `src/routes/api/ingest.ts`
- `src/lib/scan/normalize.ts` (+ tests) — axe results → `IngestIssue[]`
- `src/lib/scan/scanner.ts` — browser lifecycle + `scanPage(url)`
- `src/lib/scan/url-guard.ts` (+ tests) — SSRF guard
- `src/lib/run-monitor.ts` (+ tests) — orchestrates scan → store → monitor
  row update (uses `nextRunAt` from `monitor-schedule.ts`)
- `src/lib/scan/scanner.e2e.test.ts` — env-gated (`MONITOR_E2E=1`) real-browser test
- `src/lib/monitor-fns.ts` + `MonitorsClient.tsx` (+tests) — "Run now"
- `nixpacks.toml` (new) — add Chromium to the Railway image
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- The ticker/scheduler (plan 045) — nothing here runs unattended
- Alerting/email on regressions
- `monitor-schedule.ts` internals, schema changes
- Any change to the ingest route's auth/CORS/limits/429 behavior

## Git workflow

Work directly on `main`; commit e.g.
`Add the server-side scan engine: headless axe scans stored as audits`.
Do NOT push unless the operator instructed it (the nixpacks.toml change
deploys Chromium — see Step 7).

## Steps

### Step 1: Extract `audit-store.ts`

Move the transaction body from the ingest route into:

```ts
// Stores one parsed audit run for a user — the single write path shared by
// /api/ingest and monitor runs, so idempotency (userId,url,scannedAt) and
// grouping stay identical no matter who scanned.
export async function storeAuditRun(
  userId: string,
  payload: IngestPayload,
): Promise<{ duplicate: true } | { duplicate: false; auditId: string; count: number }>
```

The route keeps auth, CORS, rate limit, body caps, JSON/parse errors, and its
existing responses (it maps `auditId`/`count` exactly as before). Behavior
change: none — `pnpm test` (ingest contract + payload suites) must stay green
untouched.

### Step 2: SSRF guard

`src/lib/scan/url-guard.ts`: `assertScannableUrl(url: string)` — throws with
a user-readable message unless `http(s)`, and rejects when the hostname is
`localhost`, an IPv4 literal in `10/8, 172.16/12, 192.168/16, 127/8,
169.254/16, 0/8`, or an IPv6 loopback/link-local/unique-local literal.
Call it in `addMonitor` (plan 043's query) as well as before every scan.
Tests: table of accepted/rejected URLs.

### Step 3: Normalizer

`src/lib/scan/normalize.ts`: `axeToIssues(results): IngestIssue[]` taking
`axe.AxeResults["violations"]`. Per violation node → one flat issue:
`ruleId = violation.id`, `impact = node.impact ?? violation.impact ?? "minor"`
(validated against the four impacts), `wcag = wcagFromTags(violation.tags)`
(same regex/format as the extension — dotted `"1.4.3"` strings),
`category` from `cat.*` tags via a small map (mirror the extension's
labels for the common `cat.*` tags; unknown → `"other"`),
`title = violation.help`, `description = violation.description`,
`helpUrl`, `selector = node.target.join(" ")`, `html = node.html` clipped to
500 chars (the extension's clip), `failureSummary`, `domOrder` = running
index. Tests: fixture axe results (hand-written JSON) → exact issue arrays;
impact fallback; wcag tag extraction; html clipping.

### Step 4: Scanner

`src/lib/scan/scanner.ts`:

```ts
export function chromiumPath(): string  // env CHROMIUM_PATH ?? "chromium"
export async function scanPage(url: string): Promise<IngestPayload>
```

Launch `chromium.launch({ executablePath, headless: true, args:
["--no-sandbox"] })` (document why: the Railway container has no user
namespace for the sandbox — same reason har-analyzer exposes
`CAPTURE_SANDBOX`), new context (viewport 1280×800, a self-identifying
user agent `MendMonitor/1.0 (+https://<site>/support)`), `goto` with 45 s
timeout + `load`, 1 s settle, `addScriptTag({ content: axeSource })`,
`page.evaluate` running `axe.run(document, { resultTypes: ["violations"] })`,
then build the payload: `url` (the *requested* url, not post-redirect —
keeps the monitor row and audit row joined), `pageTitle` from
`page.title()`, `startedAt: Date.now()` before navigation, `durationMs`,
`totalChecks: results.passes ? violations+passes count : undefined`,
`partial: false`, `issues: axeToIssues(...)` — then `parsePayload` the
result before returning (self-validating against the ingest contract).
Always `browser.close()` in `finally`.

Env-gated e2e test (`scanner.e2e.test.ts`, skipped unless `MONITOR_E2E=1`):
serve a small fixture HTML (missing alt, missing label) from a local http
server, scan it, assert ≥2 known ruleIds. This is the only test that needs a
real browser; everything else runs in CI without Chromium.

### Step 5: `runMonitor`

`src/lib/run-monitor.ts`:

```ts
export async function runMonitor(m: { id; userId; url }): Promise<void>
```

`assertScannableUrl` → `scanPage` → `storeAuditRun` → update the monitor row:
success → `lastRunAt: now, lastError: null, nextRunAt: nextRunAt(now)`;
failure (any throw) → same `lastRunAt`/`nextRunAt` but `lastError` set to a
clipped (500 chars) message. **A failed run still re-rolls `nextRunAt`** — a
permanently-broken page must not hot-loop. Tests (PGlite + a stubbed
`scanPage` via dependency injection or vi.mock): success path writes an
audit and clears `lastError`; failure path writes no audit, sets
`lastError`, and still advances `nextRunAt` into tomorrow.

### Step 6: "Run now"

`monitor-fns.ts`: `runMonitorNow` POST fn — session check, load the monitor
scoped `(userId, id)`, reject if a run for this monitor started in the last
10 minutes (compare `lastRunAt`), then `await runMonitor(...)` and return
the refreshed row. `MonitorsClient`: a "Run now" button per row with a
busy state; surface `lastError` after. Component test: button calls the fn
(mocked).

### Step 7: Railway Chromium (`nixpacks.toml`)

Create:

```toml
# Chromium for the monitor scanner (plan 044). playwright-core launches the
# system binary from PATH — no playwright download step exists on purpose.
[phases.setup]
nixPkgs = ["...", "chromium"]
```

(`"..."` preserves Nixpacks' auto-detected packages — verify this syntax
against current Nixpacks docs before committing.) Do **not** touch
`packageManager` or `railway.json`.

**This step cannot be fully verified locally.** The deploy gate: after the
operator pushes, open `/monitors` in production, "Run now" on a real page,
and confirm an audit appears on the dashboard. Record the result in the
status row. Until then the feature is safe-but-inert in production (Run now
returns the launch error into `lastError`).

### Step 8: Full gate

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all exit 0, plus
the local `MONITOR_E2E=1` scan test with `CHROMIUM_PATH` set.

## Done criteria

- [ ] Ingest route delegates storage to `storeAuditRun`; all pre-existing
      ingest tests pass unmodified
- [ ] `pnpm test` green without any browser installed (e2e test self-skips)
- [ ] `MONITOR_E2E=1` e2e scan passes locally
- [ ] "Run now" produces a dashboard-visible audit locally (manual check via
      `pnpm dev`)
- [ ] `nixpacks.toml` committed; deploy verification recorded (or explicitly
      noted as pending operator push) in the status row
- [ ] `pnpm lint`/`typecheck`/`build` exit 0; no out-of-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 039 has landed edits to the ingest route's transaction that conflict
  with the Step 1 extraction — reconcile with the reviewer, don't guess.
- `?raw` import of `axe-core/axe.min.js` fails in the nitro build — report;
  the fallback (bundling via fs read at build time) is a design change.
- Playwright cannot launch the system Chromium locally after a good-faith
  `CHROMIUM_PATH` setup — report the launch error rather than switching
  libraries.
- Adding the deps re-resolves the pinned `nitro-nightly` version in the
  lockfile (CLAUDE.md: the alias is exact on purpose) — abort the install.

## Maintenance notes

- SSRF guard is literal-IP only; a DNS name resolving to a private address
  gets through. Acceptable now (single-tenant data, browser sandbox, no
  response echo); revisit before any team/multi-tenant tier. Documented
  deliberately — do not silently "fix" with a resolver check that breaks
  intranet-hosted staging monitors without a decision.
- `--no-sandbox` is required in the container; if Railway ever supports
  user-namespace sandboxing, drop it (mirror har-analyzer's
  `CAPTURE_SANDBOX` idea with an env toggle then).
- Scan fidelity vs the extension: same axe major, but the extension runs
  post-interaction on a logged-in tab; monitors see the public page. Rule
  results can legitimately differ — the dashboard mixing both is by design.
- Memory: one Chromium at a time (plan 045 runs sequentially). If Railway
  memory pressure appears, lower the viewport or add `--single-process` only
  after measuring.
