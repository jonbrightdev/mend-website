# Plan 053: Bound the unbounded audit-history loads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9930443..HEAD -- src/lib/dashboard-queries.ts src/lib/vpat-data.ts src/db/schema.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `9930443`, 2026-07-21

## Why this matters

`getDashboardData` and `buildVpatData` each load **every `audit` row the user
has ever recorded** — no date bound, no `LIMIT` — and then reduce them in
JavaScript to "the latest run per URL" plus an 8-day trend.

The dashboard only ever displays 8 distinct run days
(`MAX_RUN_DATES = 8`). The VPAT report only needs the latest run per URL. In
both cases the work loaded scales with **account age**, not with anything shown.

This is about to get materially worse. The monitor feature (plans 043–045)
writes one `audit` row per monitored page per day, and `MONITOR_SCHEDULER_ENABLED`
is now cleared to turn on. A two-year-old account with 10 monitored pages
would load ~7,300 rows on every dashboard render, every VPAT preview, and every
VPAT download, to show 8 days of trend.

After this plan, both paths load a bounded set whose size depends on the number
of monitored pages and the trend window — not on how long the account has
existed. **Observable behavior must not change at all**; the existing
characterization tests are the proof.

## Current state

Files in play:

- `src/lib/dashboard-queries.ts` — `getDashboardData`, the hot path. Contains the unbounded load.
- `src/lib/vpat-data.ts` — `buildVpatData`, same pattern, simpler requirements.
- `src/lib/dashboard-queries.test.ts` — **existing characterization tests**. These are your safety net; do not weaken them.
- `src/lib/vpat-data.test.ts` — same for the VPAT builder.
- `src/db/schema.ts` — the `audit` table and its single index.

### The unbounded load in `dashboard-queries.ts` (around line 50)

```ts
  // Run skeletons only — these rows are small; the weight was the nodes payload.
  const runs = await db
    .select({
      id: audit.id,
      url: audit.url,
      pageTitle: audit.pageTitle,
      scannedAt: audit.scannedAt,
    })
    .from(audit)
    .where(eq(audit.userId, userId))
    .orderBy(asc(audit.scannedAt));
  if (runs.length === 0) return { audits: [], runDates: [] };
```

### The second unbounded load, immediately after (around line 62)

```ts
  const totals = await db
    .select({
      auditId: violation.auditId,
      total: sql<number>`sum(jsonb_array_length(${violation.nodes}))`.mapWith(Number),
    })
    .from(violation)
    .innerJoin(audit, eq(violation.auditId, audit.id))
    .where(eq(audit.userId, userId))
    .groupBy(violation.auditId);
```

### The identical pattern in `vpat-data.ts` (around line 113)

```ts
  // Run skeletons, oldest first, so the last one seen per URL is the latest —
  // the dashboard's own semantics.
  const runs = await db
    .select({ id: audit.id, url: audit.url, pageTitle: audit.pageTitle, scannedAt: audit.scannedAt })
    .from(audit)
    .where(eq(audit.userId, userId))
    .orderBy(asc(audit.scannedAt));
  if (runs.length === 0) return null;

  const latestByUrl = new Map<string, (typeof runs)[number]>();
  for (const run of runs) latestByUrl.set(run.url, run);
```

### The semantics you must preserve — read this twice

`getDashboardData`'s own docstring states the contract:

> Every run for the user, shaped for the dashboard: the latest run per URL
> becomes the page's AuditRecord; older runs of the same URL feed history[],
> aligned to runDates (distinct run days, oldest first, capped at 8). Days
> before a page's first run count 0; **between runs the last total carries
> forward**.

The carry-forward is the trap. History is built with:

```ts
    const history = runDates.map((date) => {
      let total = 0;
      for (const run of urlRuns) {
        if (dayOf(run.scannedAt) > date) break;
        total = totalByAudit.get(run.id) ?? 0;
      }
```

For the **earliest** of the 8 run days, the correct value may come from a run
that happened *long before* the window — a page scanned once in January and not
since still shows its January total across all 8 days. **A naive "only load the
last 8 days" bound silently changes that to 0.** The fix must keep one
pre-window run per URL as a carry-forward seed.

`MAX_RUN_DATES` is defined at `src/lib/dashboard-queries.ts:15`:

```ts
const MAX_RUN_DATES = 8;
```

### The index

`src/db/schema.ts` gives `audit` exactly one index:

```ts
  (t) => [uniqueIndex("audit_user_url_scanned").on(t.userId, t.url, t.scannedAt)],
```

The queries here filter on `userId` and order by `scannedAt` with `url`
unconstrained, so this index leads on the right column but does not give sorted
`scannedAt`. Adding a `(userId, scannedAt)` index is **optional** in this plan
and gated on measurement — see Step 5.

### Conventions this repo uses — match them

- **Migrations only via `pnpm db:generate`.** Never `pnpm db:push`. `railway.json`
  runs `pnpm db:migrate` pre-deploy, so anything created only by a local push
  is absent in production. `CLAUDE.md` documents an incident caused by exactly
  this. If you add an index in Step 5, generate a migration and commit it.
- **Comments explain *why*.** This module's existing comments are unusually
  good — each query says why it is shaped the way it is. Match that.
- **Tests use a real in-memory Postgres.** `src/test/db.ts` replays every
  `drizzle/*.sql` into PGlite. Tests are not mocked; follow the existing style.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Generate routes | `pnpm generate-routes` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Targeted tests | `pnpm vitest run src/lib/dashboard-queries.test.ts src/lib/vpat-data.test.ts` | all pass |
| Full suite | `pnpm test` | all pass (528 at plan time) |
| Migration (only if Step 5) | `pnpm db:generate` | new file under `drizzle/` |
| Build | `pnpm build` | exit 0 |

Run `nvm use` first — `.nvmrc` pins Node 24.

## Scope

**In scope**:

- `src/lib/dashboard-queries.ts`
- `src/lib/vpat-data.ts`
- `src/lib/dashboard-queries.test.ts` (add tests; do not weaken existing ones)
- `src/lib/vpat-data.test.ts` (add tests)
- `src/db/schema.ts` + one generated `drizzle/*.sql` — **only if** Step 5's
  measurement justifies it

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/export-data.ts` — it has the same unbounded shape *and worse* (it
  loads every historical violation, not just the latest run's). Fixing it
  requires a **product decision** nobody has made: does "export my data" mean
  current state or full history? Changing it silently would alter a
  user-facing data-portability promise. Leave it entirely; it is recorded as a
  separate finding.
- `src/lib/dashboard-data.ts` — pure presentation helpers, no queries.
- The `AuditRecord` / `VpatReportData` return shapes — downstream components
  and tests depend on them. This plan changes *how* data is fetched, never
  what is returned.
- `src/lib/retention.ts` — unrelated.

## Git workflow

- Work directly on `main` — this repo does not use feature branches (see
  `CLAUDE.md`). Do not open a PR.
- Commit message style: imperative subject, blank line, prose body explaining
  *why*. Recent example: `Add security headers to every response`.
- Do **not** push. Leave the commit local for review.

## Steps

### Step 1: Lock in the current behavior before changing anything

Run the two characterization suites and record the pass count.

**Verify**: `pnpm vitest run src/lib/dashboard-queries.test.ts src/lib/vpat-data.test.ts`
→ all pass. Note the number. These tests already pin carry-forward history,
the 8-day cap, same-day-last-run-wins, and user isolation. **Every one of them
must still pass unchanged at the end.** If you find yourself editing an
existing assertion, that is a STOP condition.

### Step 2: Bound `buildVpatData` (the easy one — do this first)

`buildVpatData` needs only the **latest run per URL**. It currently loads
everything and keeps the last one seen per URL.

Replace the unbounded select with a query that returns one row per URL
directly. Postgres `DISTINCT ON` is the natural fit and PGlite supports it:

```sql
SELECT DISTINCT ON (url) id, url, "pageTitle", "scannedAt"
FROM audit WHERE "userId" = $1
ORDER BY url, "scannedAt" DESC
```

In Drizzle, express this with `sql` — follow the existing `sql<number>` usage
in `dashboard-queries.ts` for the house style. Keep the downstream
`latestByUrl` / `latestRuns` / `latestIds` variables working, or simplify them
now that the query already returns one row per URL.

**Important**: the existing code orders `asc(scannedAt)` and takes the *last*
seen per URL. `DISTINCT ON (url) ... ORDER BY url, scannedAt DESC` selects the
*first* per URL under a descending sort — the same row. Confirm with the tests,
not by reasoning.

**Verify**: `pnpm vitest run src/lib/vpat-data.test.ts` → all pass, unchanged.

### Step 3: Bound `getDashboardData`'s run load

This is the careful one. Do it in three parts.

**3a — find the window.** Query the distinct run days for the user, newest
first, limited to `MAX_RUN_DATES`. The oldest day in that result is your
`cutoff`. Something like:

```sql
SELECT DISTINCT date_trunc('day', "scannedAt") AS day
FROM audit WHERE "userId" = $1
ORDER BY day DESC LIMIT 8
```

If this returns no rows, return `{ audits: [], runDates: [] }` exactly as the
current early-return does.

**3b — load in-window runs plus one carry-forward seed per URL.** You need:

- every run with `scannedAt >= cutoff`, **and**
- for each URL, the single most recent run with `scannedAt < cutoff`

The second set is what preserves carry-forward for pages not scanned during the
window. Express it as a `UNION ALL` of the in-window select and a
`DISTINCT ON (url) ... WHERE scannedAt < cutoff ORDER BY url, scannedAt DESC`
select, then order the combined result by `scannedAt ASC` so the existing
downstream loops (which assume oldest → newest) keep working unchanged.

**3c — bound the totals query.** The `totals` aggregate currently sums node
counts for **every** violation the user has. Restrict it to the audit ids you
actually loaded in 3b, using `inArray(violation.auditId, loadedIds)` — the same
`inArray` idiom already used a few lines below for `latestViolations`.

Leave every line after the queries — `runDates`, `byUrl`, the `history`
mapping, `latestIds`, `violationsByAudit` — **untouched**. If those need to
change, the queries are wrong.

**Verify**: `pnpm vitest run src/lib/dashboard-queries.test.ts` → all pass,
with no edits to existing assertions.

### Step 4: Add regression tests for the bound itself

The existing tests prove behavior is preserved on small fixtures. Add tests
that would fail against a naive bound.

In `src/lib/dashboard-queries.test.ts`, following the existing fixture style
in that file, add:

1. **Carry-forward from before the window.** Seed a URL with one run ~60 days
   old and no runs since, plus another URL with runs on 8 recent distinct days
   (so the window is well past the old run). Assert the old URL's `history`
   shows its original total across all 8 points — **not** zeros. This is the
   test that catches the naive-bound mistake.
2. **More than 8 run days.** Seed 12 distinct run days for one URL; assert
   `runDates.length === 8` and that history matches the most recent 8.

In `src/lib/vpat-data.test.ts`, add:

3. **Latest-per-URL with many historical runs.** Seed one URL with 5 runs;
   assert the report reflects only the newest run's violations.

**Verify**: `pnpm vitest run src/lib/dashboard-queries.test.ts src/lib/vpat-data.test.ts`
→ all pass, including 3 new tests.

### Step 5 (conditional): Add a `(userId, scannedAt)` index

**Only do this if you can measure a benefit.** The audit that produced this
plan rated the index LOW confidence precisely because nobody ran `EXPLAIN`.

If you can run `EXPLAIN ANALYZE` against a realistically-sized `audit` table
and see a `Sort` node that an index would remove, add:

```ts
index("audit_user_scanned_idx").on(t.userId, t.scannedAt)
```

to the `audit` table's index list in `src/db/schema.ts`, then run
`pnpm db:generate` and commit the generated migration.

If you cannot measure it, **skip this step** and say so in your status note.
An unmeasured index is a write-side cost on every ingest for a guess.

**Verify (only if done)**: `pnpm db:generate` produces exactly one new file in
`drizzle/`; `pnpm test` still passes (the harness replays every migration).

### Step 6: Full gate

**Verify**, in order, all exit 0:

```
pnpm generate-routes
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Test plan

- **New tests**: 3, listed in Step 4 — two in `dashboard-queries.test.ts`, one
  in `vpat-data.test.ts`.
- **Structural pattern**: the existing `describe("getDashboardData")` block in
  `src/lib/dashboard-queries.test.ts`. It seeds a real PGlite database via
  `createTestDb()` from `src/test/db.ts`. Note the fixture convention in that
  file: users get short prefixed ids, and one `db` instance is shared across
  describe blocks via `db ??= await createTestDb()` — **do not call
  `createTestDb()` a second time in the same file** without understanding that
  the module under test binds its `db` import once.
- **Existing tests are the real safety net.** They must pass unchanged.
- **Verification**: `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0
- [ ] `pnpm test` exits 0, with 3 new passing tests
- [ ] Every test that existed in `dashboard-queries.test.ts` and
      `vpat-data.test.ts` before this plan still passes, with its assertions
      unmodified (`git diff` on those files shows additions only, no changed
      `expect(...)` lines)
- [ ] `grep -n "where(eq(audit.userId, userId))" src/lib/dashboard-queries.ts src/lib/vpat-data.ts`
      shows no remaining *unbounded* run-skeleton select in either file
- [ ] `src/lib/export-data.ts` is unmodified
- [ ] `git status --short` lists only in-scope files and `plans/README.md`
- [ ] `plans/README.md` status row for 053 updated, recording whether Step 5
      was done and why

## STOP conditions

Stop and report back (do not improvise) if:

- Any existing test in `dashboard-queries.test.ts` or `vpat-data.test.ts`
  fails and the fix would mean **editing that test's assertions**. The tests
  encode the product's semantics; a change there means this plan's approach is
  wrong, not the test.
- The carry-forward test from Step 4.1 cannot be made to pass without loading
  full history. Report what you found — it may mean the seed query needs a
  different shape, and guessing risks shipping a silent behavior change to
  every dashboard.
- `DISTINCT ON` turns out not to work under PGlite in the test harness. Report
  it; there is a portable window-function alternative, but pick it
  deliberately rather than discovering it halfway.
- You find yourself wanting to modify `src/lib/export-data.ts`. It is out of
  scope and blocked on a product decision.

## Maintenance notes

For whoever owns this next:

- **`export-data.ts` still has the original problem, deliberately.** It loads
  every historical violation for the account. Resolving it needs a product
  answer first: is the JSON export "everything ever" (then it needs streaming
  or pagination) or "current state" (then reuse the latest-per-URL narrowing
  from this plan)? Do not fix it without answering that.
- **The carry-forward seed query is the fragile part.** If anyone later
  changes `MAX_RUN_DATES`, or changes history to something other than
  carry-forward, revisit Step 3b — the seed exists solely to serve
  carry-forward.
- **Retention interacts with this.** If `RETENTION_PURGE_ENABLED` is turned on,
  old runs get deleted anyway and the bound matters less — but the bound is
  still correct and should stay, since retention windows are plan-dependent
  (Free 30 days, Pro 2 years) and Pro accounts keep enough history to hurt.
- A reviewer should scrutinize exactly one thing: that a page scanned once,
  long before the 8-day window, still shows its total carried forward rather
  than zeros. That is the single behavior a bound most easily breaks.
