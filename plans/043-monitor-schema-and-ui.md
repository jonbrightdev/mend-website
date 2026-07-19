# Plan 043: Monitored pages — schema, queries, and the /monitors UI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a0f7690..HEAD -- src/db/schema.ts drizzle src/components/SiteHeader.tsx src/routes`
> Plan 036 (billing) also adds tables to `schema.ts` — additive coexistence is
> expected; a *conflicting* edit to the same lines is not. If `NavPage` or the
> schema idioms below have changed shape, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (schema + CRUD + UI only; no scanning, no scheduler)
- **Depends on**: none
- **Category**: feature — monitoring generation (043 → 044 → 045)
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

Today an audit exists only when a user runs the extension by hand. The
monitoring feature ("tell us which pages to track; we scan them once a day at
a random time we pick") needs three parts: somewhere to store *what to watch
and when it next runs* (this plan), a server-side scanner that produces audits
in the exact shape the extension does (plan 044), and a scheduler that fires
due runs (plan 045). This plan lands the schema, the pure scheduling math, and
a `/monitors` page where users add, pause, resume, and remove tracked URLs —
fully testable and shippable before any scanning exists (the UI labels runs
as "starting soon" until 044/045 land).

Inspiration: har-analyzer's monitors (`apps/api/src/types/schedule.ts`,
worker `reconcileSchedules`). Deliberately simplified for this repo: no
Redis/BullMQ, no cron expressions, no timezones — one Railway node, a
`nextRunAt` timestamp per monitor in Postgres, and a random daily cadence we
control. That mirrors the repo's settled "single node, in-process" decision
(see plan 024 notes in `plans/README.md`).

## Design decisions (settled — do not re-litigate)

- **Cadence**: once per day at a *uniformly random UTC time*, re-rolled every
  run. On creation the first run is a random instant within the next 24 h
  (so new monitors produce data on day one); after every run (success or
  failure), the next run is a random instant inside the *next* UTC calendar
  day. No user-facing schedule controls.
- **Pause = `pausedAt` set**, not deletion; `nextRunAt` is left in place and
  simply ignored while paused; resuming re-rolls `nextRunAt` within 24 h.
- **Cap**: `MAX_MONITORS = 10` per user (mirrors `MAX_ACTIVE_KEYS` in
  `account-queries.ts`). A capacity guard, not a billing tier — plan 039's
  entitlements may later make it plan-aware; out of scope here.
- **Dedup**: unique on `(userId, url)` — re-adding a deleted URL is fine,
  adding a duplicate is a friendly error.
- **Run results land in the existing `audit`/`violation` tables** (plan 044),
  so the dashboard, detail pages, export, and VPAT all see monitor runs for
  free. The monitor row only tracks scheduling state and the last outcome.

## Current state

- `src/db/schema.ts` — table idiom: text PK, `userId` FK with
  `onDelete: "cascade"`, `uniqueIndex`/`index` in the third argument
  (see `audit`, `apiKey`).
- Migrations: `pnpm db:generate` writes `drizzle/*.sql`; the test harness
  `src/test/db.ts` replays every migration into PGlite, so a missing
  migration fails the suite. **Never `db:push`** (CLAUDE.md).
- `src/components/SiteHeader.tsx` — `NavPage` union
  (`"home" | … | "dashboard" | "account"`); signed-in links render inside the
  `{account ? … }` branch.
- Route idiom: `src/routes/dashboard.tsx` — `createFileRoute`, loader calls a
  server fn from `src/lib/*-fns.ts`, which calls queries in a server-only
  `*-queries.ts` (the split exists because a non-handler export reaching
  `@/db` drags the driver into the client bundle — see the comment atop
  `account-queries.ts`).
- Mutation idiom: `AccountClient.tsx` + `account-fns.ts` (`createServerFn`
  with validator, revalidate via `router.invalidate()` on the client).
- `src/routeTree.gen.ts` is generated — run `pnpm generate-routes` after
  adding a route file.

## Commands you will need

| Purpose    | Command                | Expected |
|------------|------------------------|----------|
| Migration  | `pnpm db:generate`     | new file under `drizzle/` |
| Routes     | `pnpm generate-routes` | regenerates `routeTree.gen.ts` |
| Typecheck  | `pnpm typecheck`       | exit 0   |
| Tests      | `pnpm test`            | all pass |
| Lint       | `pnpm lint`            | exit 0   |
| Build      | `pnpm build`           | exit 0   |

## Scope

**In scope**:
- `src/db/schema.ts` (+ generated migration in `drizzle/`)
- `src/lib/monitor-schedule.ts` (pure) + `monitor-schedule.test.ts`
- `src/lib/monitor-queries.ts` (server-only) + `monitor-queries.test.ts`
- `src/lib/monitor-fns.ts` (server fns)
- `src/routes/monitors.tsx` + `src/components/MonitorsClient.tsx`
  (+ `MonitorsClient.test.tsx`, jsdom, following `DashboardClient.test.tsx`)
- `src/components/SiteHeader.tsx` (`NavPage` + nav link)
- Minimal CSS **only if** existing classes (`panel`, `data` table, `btn`,
  `count-pill`, form field classes from AccountClient) don't cover it
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- Any scanning or browser code (plan 044)
- Any ticker/boot hook (plan 045)
- `railway.json`, env vars
- Billing/entitlements (`MAX_MONITORS` is a plain constant)

## Git workflow

Work directly on `main`; commit e.g. `Add monitored pages: schema, queries, and the /monitors UI`.
Do NOT push unless the operator instructed it.

## Steps

### Step 1: Schema + migration

Add to `src/db/schema.ts`:

```ts
// A URL the user asked us to track. The scheduler (plan 045) runs every
// monitor whose nextRunAt has passed and pausedAt is null, stores the result
// as a normal audit row, then re-rolls nextRunAt to a random instant in the
// next UTC day (src/lib/monitor-schedule.ts). lastError is the last run's
// failure message, cleared on success.
export const monitor = pgTable(
  "monitor",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    pausedAt: timestamp("pausedAt"),
    nextRunAt: timestamp("nextRunAt").notNull(),
    lastRunAt: timestamp("lastRunAt"),
    lastError: text("lastError"),
  },
  (t) => [
    uniqueIndex("monitor_user_url").on(t.userId, t.url),
    // The scheduler's due-scan is a range query on nextRunAt.
    index("monitor_next_run_idx").on(t.nextRunAt),
  ],
);
```

Run `pnpm db:generate`; commit the migration. **Verify**: `pnpm test` —
the harness replays the new migration; suite stays green.

### Step 2: Pure schedule math

`src/lib/monitor-schedule.ts` — no imports beyond types; `rand` injectable
for tests:

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

/** First run: a uniformly random instant within the next 24 hours. */
export function initialRunAt(now: Date, rand: () => number = Math.random): Date

/** Steady state: a uniformly random instant inside the NEXT UTC calendar
 *  day (00:00–24:00 after the day containing `now` ends). */
export function nextRunAt(now: Date, rand: () => number = Math.random): Date
```

`nextRunAt` = `Date.UTC(y, m, d + 1)` of `now`'s UTC date, plus
`floor(rand() * DAY_MS)`.

Tests (`monitor-schedule.test.ts`): with `rand = () => 0` /
`() => 0.999…`, assert exact bounds; assert `nextRunAt` always lands in
tomorrow's UTC day even when `now` is 23:59:59.999Z; assert
`initialRunAt` ∈ `(now, now + 24h]`.

### Step 3: Queries

`src/lib/monitor-queries.ts` (server-only header comment, same as
`account-queries.ts`). Client-safe row shape (dates as ISO strings, like
`ApiKeyRow`):

```ts
export interface MonitorRow {
  id: string; url: string; createdAt: string; pausedAt: string | null;
  nextRunAt: string; lastRunAt: string | null; lastError: string | null;
}
export const MAX_MONITORS = 10;
export function listMonitors(userId: string): Promise<MonitorRow[]>   // by createdAt desc
export function addMonitor(userId: string, url: string): Promise<MonitorRow>
export function setPaused(userId: string, id: string, paused: boolean): Promise<void>
export function deleteMonitor(userId: string, id: string): Promise<void>
```

`addMonitor`: validate `^https?://` and length ≤ 2000 (the ingest limit for
urls); normalize by trimming; enforce `MAX_MONITORS` (count of *un-deleted*
monitors, paused included); translate the unique-violation into
`"You're already monitoring this page."`; set
`nextRunAt: initialRunAt(new Date())`. Every mutation is scoped
`where (userId AND id)` — the single-column-equality security boundary idiom
from `export-data.ts` applies; never widen it.

Tests: PGlite harness (`createTestDb()` pattern from
`dashboard-queries.test.ts`): add/list roundtrip; duplicate url rejects;
11th monitor rejects; pause/resume flips `pausedAt` and resume re-rolls
`nextRunAt`; delete removes; cross-user isolation on every mutation.

### Step 4: Server fns

`src/lib/monitor-fns.ts`: `fetchMonitors` (GET; session check →
`{ user, monitors }`, redirect to `/login` like `fetchDashboard`), plus
POST fns `createMonitor`, `toggleMonitor`, `removeMonitor` wrapping the
queries with validators (string url / id). Follow `account-fns.ts` for the
validator + error-message-surfacing style.

### Step 5: Route + UI

`src/routes/monitors.tsx`: loader `fetchMonitors`, head meta
(`Monitors — Mend`), `MarketingShell current="monitors"`. Extend `NavPage`
with `"monitors"` and add a signed-in nav link between Dashboard and Account.

`src/components/MonitorsClient.tsx`:

- Add form: single URL input + "Track this page" button; inline error line
  (quota / duplicate / invalid URL) via `role="alert"`.
- Table (`data` class, per-row): URL; status ("Paused", "Scheduled" when
  `lastRunAt` null, "Error" + `lastError` when set, else "OK"); last run
  (relTime — reuse `relTime`/`fmtDateTime` from `@/lib/dashboard-data`);
  next run shown as **"Sometime tomorrow"/"Within 24 hours"** style copy —
  deliberately vague, the random time is ours, not a promise; actions:
  Pause/Resume, Remove (confirm like key revoke in AccountClient).
- Empty state: short explainer — "Add a page and Mend will audit it once a
  day. Results land on your dashboard alongside your extension audits."
- Until plan 045 lands the scheduler, rows will sit at "Scheduled"
  indefinitely in production; that is acceptable and expected — do not build
  a fake status.

Run `pnpm generate-routes`.

Component tests (jsdom, follow `DashboardClient.test.tsx` conventions incl.
per-file `afterEach(cleanup)`): renders rows; empty state; add-form submits
the server fn (mock it); paused row shows Resume.

### Step 6: Full gate

`pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
→ all exit 0.

## Done criteria

- [ ] New migration committed under `drizzle/`; `pnpm test` green (harness
      replays it)
- [ ] `/monitors` renders for a signed-in user; nav link present
- [ ] All new test files pass; full gate exits 0
- [ ] `grep -rn "db:push"` finds no new usage
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 036 landed a conflicting `schema.ts` change you cannot merge additively.
- The route/server-fn idiom has changed such that the `dashboard.tsx` /
  `account-fns.ts` templates no longer represent the codebase.
- `pnpm db:generate` produces a migration touching *existing* tables.

## Maintenance notes

- All scheduling is UTC; "a random time once a day" is a product promise, not
  a timezone feature. If per-user timezones are ever wanted, only
  `monitor-schedule.ts` changes.
- Plan 044 adds `lastError`-writing and a "Run now" action to this UI; plan
  045 consumes `nextRunAt`/`pausedAt`. Keep the column semantics stable.
- Billing interplay (when 039 lands): monitor-created audits will count
  toward the Free audit cap, and `MAX_MONITORS` should become plan-aware.
  Flagged in `plans/README.md` dependency notes; not this plan's problem.
