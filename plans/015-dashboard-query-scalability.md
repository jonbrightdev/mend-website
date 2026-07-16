# Plan 015: Stop the dashboard from loading every run's full violation payload

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dbd4669..HEAD -- src/lib/dashboard-queries.ts src/lib/dashboard-data.ts`
> If `getDashboardData` changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (rewrites the history math — the test fixture is the safety net)
- **Depends on**: plans/009-test-and-ci-baseline.md (required), plans/012-violation-auditid-index.md (should land first)
- **Category**: perf
- **Planned at**: commit `dbd4669`, 2026-07-16

## Why this matters

`getDashboardData` loads **every run the user has ever synced and every
violation row for all of them — including the `nodes` jsonb columns holding
HTML snippets** — into server memory on every dashboard visit, only to reduce
most of it to per-run totals for an 8-point trend line. Memory and query cost
grow linearly with lifetime usage, and the full `nodes` payloads for each
page's latest run are then serialized to the client even though the dashboard
UI only renders counts. This plan keeps the function's output shape identical
while fetching only what's needed: full violations for the **latest run per
URL** only, and SQL-side per-run totals for the history.

## Current state

- `src/lib/dashboard-queries.ts:46-102` — the function to rewrite. Current
  logic, in full:

  ```ts
  export async function getDashboardData(
    userId: string,
  ): Promise<{ audits: AuditRecord[]; runDates: string[] }> {
    const runs = await db
      .select()
      .from(audit)
      .where(eq(audit.userId, userId))
      .orderBy(asc(audit.scannedAt));
    if (runs.length === 0) return { audits: [], runDates: [] };

    const violationRows = await db
      .select()
      .from(violation)
      .where(inArray(violation.auditId, runs.map((r) => r.id)));

    // groups violations by auditId into byAudit: Map<string, ViolationRow[]>
    // runDates = distinct YYYY-MM-DD of runs, sorted, last 8 (MAX_RUN_DATES)
    // groups runs by url into byUrl (oldest → newest)
    // per url: latest = last run; history = for each runDate, the nodeTotal of
    //   the last run on/before that date (carry-forward; 0 before first run)
    // audits sorted newest-first by scannedAt (localeCompare on ISO strings)
  }
  ```

  Key helpers in the same file: `toViolation(row)` (maps a row to the client
  `Violation` shape), `nodeTotal(violations)` (sum of `nodes.length`),
  `dayOf(d)` (UTC `YYYY-MM-DD` slice of ISO string), `MAX_RUN_DATES = 8`.
- The **output contract** (`AuditRecord` in `src/lib/dashboard-data.ts:29-36`)
  must not change: `{ id, url, pageTitle, scannedAt: ISO string, history:
  number[] (aligned to runDates, oldest→newest), violations: Violation[] }`,
  plus top-level `runDates: string[]`. `DashboardClient.tsx` consumes exactly
  this.
- History semantics to preserve **exactly** (the subtle part):
  - `runDates` = distinct run *days* across ALL the user's runs, sorted
    ascending, capped to the **last 8**.
  - For each URL and each `runDate`: the total is `nodeTotal` of the *latest
    run of that URL on or before that date* — carry-forward between runs,
    `0` before the URL's first run. Multiple runs of a URL on one day → the
    last one (by `scannedAt` order) wins.
- `getAuditRecord` (`dashboard-queries.ts:105-129`) is already efficient
  (one audit + its violations) — leave it alone.
- `violation_audit_idx` on `violation(auditId)` exists if plan 012 landed.
- Drizzle version: `drizzle-orm ^0.45`. Raw SQL fragments via
  `sql` from `"drizzle-orm"` are acceptable in this repo when the query
  builder can't express something (none used yet — keep them minimal and
  commented).
- Postgres detail: `nodes` is `jsonb` holding an array, so a per-run total is
  `SUM(jsonb_array_length(nodes))`. PGlite supports `jsonb_array_length` and
  `DISTINCT ON` — the plan-009 test harness runs the real thing, so the tests
  prove compatibility on both drivers' shared SQL surface.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `pnpm install`   | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/dashboard-queries.ts`
- `src/lib/dashboard-queries.test.ts` (create — BEFORE the rewrite, see step 1)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/dashboard-data.ts` types and helpers — the contract is frozen.
- `src/components/DashboardClient.tsx` and `src/lib/dashboard-fns.ts`.
- `getAuditRecord` in the same file.
- Pagination or changing what the dashboard shows — pure like-for-like
  efficiency.

## Git workflow

- Branch: `advisor/015-dashboard-query-scalability`
- Commit style: short imperative sentences; commit step 1 (characterization
  tests) separately from the rewrite so the tests demonstrably predate it.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Characterization tests against the CURRENT implementation

Create `src/lib/dashboard-queries.test.ts` using the plan-009 harness
(`createTestDb()` before importing `@/db`-dependent modules). Seed a fixture
that exercises every history rule, e.g.:

- user A with URL `https://a.example/` runs on day1 (3 nodes across 2
  violations), day2 (1 node), day4 (0 violations); URL `https://b.example/`
  runs on day2 (2 nodes) and twice on day3 (5 nodes then 4 nodes — same-day
  ordering case); user B with 1 run (isolation case).
- Expected (compute by hand, hard-code in the test):
  `runDates = [day1, day2, day3, day4]`;
  history for A-url: `[3, 1, 1, 0]`; for B-url: `[0, 2, 4, 4]`.
  `audits` sorted newest-scan-first; each audit's `violations` are the
  **latest run's** violations with correct `nodes`.
- Also: a user with > 8 distinct run days → `runDates` is the last 8 and
  history arrays have length 8; a user with zero runs → `{ audits: [],
  runDates: [] }`.

Run these against the current code — **all must pass before you change
anything**. If any fails, STOP: your fixture encodes the semantics wrong.

**Verify**: `pnpm test` → new tests pass against the unmodified implementation.

### Step 2: Rewrite the data access

Replace the two fetch-everything queries with three narrow ones (keep the
in-memory shaping that follows them; it operates on tiny data):

1. **Run skeletons** (no change in shape, but select only needed columns):
   `db.select({ id, url, pageTitle, scannedAt }).from(audit).where(eq(audit.userId, userId)).orderBy(asc(audit.scannedAt))`
   — audits rows are small; keeping all runs here is fine, the weight was the
   violations.
2. **Per-run totals** for history, SQL-side:

   ```ts
   const totals = await db
     .select({
       auditId: violation.auditId,
       total: sql<number>`sum(jsonb_array_length(${violation.nodes}))`.mapWith(Number),
     })
     .from(violation)
     .where(inArray(violation.auditId, runs.map((r) => r.id)))
     .groupBy(violation.auditId);
   ```

   Build `totalByAudit: Map<string, number>` (runs absent from the result have
   total 0 — a run can have zero violations).
3. **Full violations for latest runs only**: compute `latestIds` (last run per
   URL from the ordered `runs`), then
   `db.select().from(violation).where(inArray(violation.auditId, latestIds))`.

Rework the history computation to use `totalByAudit.get(run.id) ?? 0` instead
of `nodeTotal(byAudit.get(run.id) ?? [])`, keeping the carry-forward loop
byte-for-byte otherwise. `nodeTotal` and the full `byAudit` map become
unnecessary — delete `nodeTotal` if nothing else uses it; keep `toViolation`.
Preserve the existing comments' explanatory style (the block comment above the
function documenting history semantics must stay accurate — update it).

If `runs.map(r => r.id)` for step-2's `inArray` bothers you at very large run
counts, note that a correlated subquery (`where(eq(violation.auditId, audit.id) and eq(audit.userId, ...))` via a join) is the cleaner form — use a join on
`audit` instead of `inArray` if it expresses cleanly in this Drizzle version:

```ts
.from(violation)
.innerJoin(audit, eq(violation.auditId, audit.id))
.where(eq(audit.userId, userId))
```

Either form is acceptable; the join avoids shipping thousands of ids in the
query.

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `pnpm test` → the step-1 characterization tests still pass, unchanged.

### Step 3: Confirm no contract drift

`git diff` must show no changes to `src/lib/dashboard-data.ts`,
`src/lib/dashboard-fns.ts`, or `src/components/DashboardClient.tsx`. Load the
dashboard in `pnpm dev` with local data and confirm the trend chart, stats,
and per-page rows render as before.

**Verify**: manual dev-server check passes; `git status` shows only in-scope files.

## Test plan

The step-1 characterization suite IS the test plan — written first, passing
against old code, unmodified through the rewrite. That's what makes this a
safe refactor for a zero-context executor.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; `src/lib/dashboard-queries.test.ts` exists with ≥ 4 tests and was committed before the rewrite (check `git log --oneline -- src/lib/dashboard-queries.test.ts`)
- [ ] `grep -n "jsonb_array_length" src/lib/dashboard-queries.ts` → 1 match (totals now computed in SQL)
- [ ] `getDashboardData` no longer selects full `violation` rows for non-latest runs (review the diff)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any characterization test fails against the ORIGINAL implementation in
  step 1 — the fixture's expected values are wrong; do not "fix" the old code.
- `jsonb_array_length` or the join errors on PGlite in tests — report the
  exact error; do not fall back to loading full rows.
- The rewrite requires changing the `AuditRecord` shape or `runDates`
  semantics to work — that's a contract change, not a refactor.

## Maintenance notes

- If the dashboard later paginates or shows per-rule history, revisit the
  latest-runs-only fetch — the history totals map is the natural place to
  extend.
- A future optimization (not now): cap the `runs` skeleton query to runs on
  the last 8 distinct days SQL-side; today the skeleton rows are cheap enough.
- Reviewer: diff the history loop against the original — the carry-forward
  and same-day-last-run-wins semantics are the regression risk, and the
  characterization tests are the evidence.
