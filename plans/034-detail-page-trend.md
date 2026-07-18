# Plan 034: Show a page's violation trend on the audit detail page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0be29dc..HEAD -- src/lib/dashboard-queries.ts src/lib/dashboard-fns.ts src/components/DashboardClient.tsx src/routes/audits`
> `DashboardClient.tsx` may have gained a test file (plan 033) — that's fine.
> Compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch in the excerpted functions, treat it as a STOP
> condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (plan 032's `pnpm lint` gate applies if landed)
- **Category**: direction
- **Planned at**: commit `0be29dc`, 2026-07-18

## Why this matters

The dashboard computes per-URL violation history and renders a trend chart —
but the audit detail page, where a user is actually working through one page's
issues, shows no trend at all: `getAuditRecord` hardcodes `history: []` (its
own comment says "history is not populated"). The data (every run of the same
URL) and the chart component both already exist; the detail page just never
receives them. Populating a per-page trend closes the gap between "my site is
getting better" (dashboard) and "this page is getting better" (where fixes
actually happen), for roughly a day's work reusing existing machinery.

## Current state

Relevant files:

- `src/lib/dashboard-queries.ts` — server-only queries.
  `getAuditRecord(userId, auditId)` at lines 128-153 returns a single run with
  `history: []`. Above it, `getDashboardData` shows the repo's idiom for
  per-run totals summed in SQL (lines 65-75) and day-bucketing via `dayOf`
  (lines 29-32).
- `src/lib/dashboard-fns.ts` — `fetchAudit` server fn wraps `getAuditRecord`;
  returns `{ user, audit: audit ?? null }`.
- `src/components/DashboardClient.tsx` — contains the private `TrendChart`
  component (lines 47-154) and its size constants; takes
  `pts: { date: string; total: number }[]`, renders the SVG bar chart plus a
  visually-hidden data table. `TrendPoint` (`{ date, total }`) is already a
  named export of `src/lib/dashboard-data.ts`.
- `src/routes/audits/$auditId/$ruleId.tsx` — the detail page. Its loader
  calls `fetchAudit`, redirects when the audit or rule is missing, and returns
  `{ user, audit, violation, rule }`. The page renders a breadcrumb, a header,
  a `DetailsChipPanel`, and the rule/fix panels using `panel` /
  `panel__head` / `hint` CSS classes (same classes the dashboard's trend panel
  uses).

`src/lib/dashboard-queries.ts:128-153` today:

```ts
/** A single run by id, scoped to the owning user. history is not populated. */
export async function getAuditRecord(
  userId: string,
  auditId: string,
): Promise<AuditRecord | undefined> {
  const [run] = await db
    .select()
    .from(audit)
    .where(and(eq(audit.id, auditId), eq(audit.userId, userId)))
    .limit(1);
  if (!run) return undefined;

  const violationRows = await db
    .select()
    .from(violation)
    .where(eq(violation.auditId, run.id));

  return {
    id: run.id,
    url: run.url,
    ...
    history: [],
    violations: violationRows.map(toViolation),
  };
}
```

The totals idiom to reuse (from `getDashboardData`, lines 65-75):

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

Design constraints to honor (decided during the audit; treat as settled):

- **Do not change the `AuditRecord` type or its `history` semantics** — the
  dashboard aligns `history` to global `runDates` with carry-forward; the
  detail page wants a simpler thing. Return the trend as a *separate* value:
  `TrendPoint[]` (one point per run **day** of this URL, the day's **last**
  run's total — matching the dashboard's day-bucketing, no carry-forward
  needed since every point is a real run of this page).
- The chart must remain one implementation: **extract** `TrendChart` (and its
  layout constants) from `DashboardClient.tsx` into
  `src/components/TrendChart.tsx` verbatim, export it, and have
  `DashboardClient` import it. No visual changes.
- The detail panel renders **only when there are ≥ 2 points** — a one-run
  trend is noise.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                               | exit 0              |
| One suite | `pnpm test src/lib/dashboard-queries.test.ts`  | all pass            |
| All tests | `pnpm test`                                    | all pass            |
| Build     | `pnpm build`                                   | exit 0              |
| Lint      | `pnpm lint` (only if the script exists)        | exit 0              |

## Scope

**In scope**:
- `src/lib/dashboard-queries.ts` (extend `getAuditRecord`'s return)
- `src/lib/dashboard-fns.ts` (pass the trend through `fetchAudit`)
- `src/components/TrendChart.tsx` (create, by extraction)
- `src/components/DashboardClient.tsx` (remove the inlined chart, import it)
- `src/routes/audits/$auditId/$ruleId.tsx` (render the panel)
- `src/lib/dashboard-queries.test.ts` (new cases)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `src/lib/dashboard-data.ts` — `AuditRecord`, `TrendPoint`, and the helpers
  stay as they are.
- `src/routes/audits/$auditId/index.tsx` — the redirect-to-default-rule route
  needs no trend.
- `src/styles/*` — the existing `panel` / `trend` classes cover the new panel;
  no new CSS.
- The dashboard's own trend behavior — extraction must be a no-op there.

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Commit message style: single imperative sentence, e.g.
  `Show a page's violation trend on the detail page`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Compute the per-page trend in `getAuditRecord`

Change `getAuditRecord`'s return type to
`Promise<{ record: AuditRecord; trend: TrendPoint[] } | undefined>` (import
`TrendPoint` from `@/lib/dashboard-data`). After loading `run`:

1. Select all runs of the same page:
   `id`, `scannedAt` from `audit` where `userId` = userId **and** `url` =
   `run.url`, ordered by `scannedAt` asc.
2. Sum node totals per run using the exact totals idiom from
   `getDashboardData` (excerpt above), additionally filtered to
   `eq(audit.url, run.url)` in the `where` (combine with `and`).
3. Bucket by day with the file's existing `dayOf` helper: for each distinct
   day (ascending), take the **last** run of that day and its total
   (`totalByAudit.get(id) ?? 0`), producing `TrendPoint[]`
   (`{ date: "YYYY-MM-DD", total }`).
4. Return `{ record: { ...unchanged fields, history: [] }, trend }`.

Update the doc comment: it currently says "history is not populated" — keep
that sentence and add "the page's own trend is returned separately as
day-bucketed TrendPoints".

**Verify**: `pnpm typecheck` → errors *only* in `dashboard-fns.ts` (the caller
you fix next) — confirms the shape actually changed.

### Step 2: Thread through `fetchAudit`

In `src/lib/dashboard-fns.ts`, `fetchAudit`'s handler:

```ts
const result = await getAuditRecord(user.id, auditId);
return { user, audit: result?.record ?? null, trend: result?.trend ?? [] };
```

**Verify**: `pnpm typecheck` → exit 0 (the detail route reads `audit` off the
result and still typechecks; it just ignores `trend` until Step 4).

### Step 3: Extract `TrendChart`

Create `src/components/TrendChart.tsx` containing, moved **verbatim** from
`DashboardClient.tsx`: the `W/H/PAD_*/INNER_*` constants and the `TrendChart`
function, now `export function TrendChart`. It needs `fmtDate` from
`@/lib/dashboard-data` — import it there. In `DashboardClient.tsx`, delete the
moved code and add `import { TrendChart } from "@/components/TrendChart";`.

**Verify**: `pnpm typecheck` → exit 0; `pnpm build` → exit 0. If plan 033's
`DashboardClient.test.tsx` exists: `pnpm test src/components/DashboardClient.test.tsx`
→ still green (extraction is a no-op).

### Step 4: Render the panel on the detail page

In `src/routes/audits/$auditId/$ruleId.tsx`:

- Loader: destructure `trend` from `fetchAudit`'s result and include it in the
  returned loader data.
- Component: read `trend` from `Route.useLoaderData()`. After the existing
  page-header block and before the rule detail content, render:

```tsx
{trend.length >= 2 && (
  <section className="panel" aria-labelledby="page-trend-h">
    <div className="panel__head">
      <h2 id="page-trend-h">This page over time</h2>
      <span className="hint">{trend.length} runs</span>
    </div>
    <TrendChart pts={trend} />
  </section>
)}
```

(Adjust placement to sit naturally with the file's existing section order —
after the header/breadcrumb area, before the chip panel — and match the
surrounding indentation. "runs" in the hint refers to day-buckets; if the
copy reads oddly next to the real markup, `{trend.length} run days` is the
accurate phrasing — pick one and keep it.)

**Verify**: `pnpm typecheck` → exit 0; `pnpm build` → exit 0.

### Step 5: Tests

Extend `src/lib/dashboard-queries.test.ts` (follow its existing harness
pattern — `createTestDb()` in `beforeAll`, dynamic import of the module under
test, direct inserts into `audit`/`violation`). New cases for
`getAuditRecord`:

1. **Multi-run trend**: three runs of the same URL on three days with
   different node totals → `trend` has 3 ascending points with the right
   totals; `record.history` is still `[]`.
2. **Same-day runs**: two runs on one day → one point, the later run's total.
3. **Zero-violation run**: a run with no violation rows → its point is 0.
4. **Isolation**: runs of a *different URL* and runs of a *different user*
   (same URL) do not appear in `trend`.
5. **Existing behavior**: the previously-passing `getAuditRecord` assertions
   updated to the new return shape (`result.record.…`).

**Verify**: `pnpm test src/lib/dashboard-queries.test.ts` → all pass;
`pnpm test` → full suite green.

## Test plan

Covered in Step 5 (server side, where the logic lives). The panel's
conditional render (`>= 2`) is enforced by the trend length; a component test
for the panel is deliberately deferred (see Maintenance notes).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build` all exit 0
- [ ] `grep -n "TrendChart" src/components/DashboardClient.tsx` → import line
      only (no local definition)
- [ ] `grep -n "history: \[\]" src/lib/dashboard-queries.ts` → still present
      (the `AuditRecord` contract is unchanged)
- [ ] `grep -n "TrendChart" src/routes/audits/\$auditId/\$ruleId.tsx` → rendered
- [ ] ≥5 new/updated test cases in `dashboard-queries.test.ts` pass
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpted `getAuditRecord` or the `TrendChart` block no longer matches
  the live code.
- Changing `getAuditRecord`'s return shape breaks a caller other than
  `fetchAudit` (`grep -rn "getAuditRecord" src/` first — at plan time,
  `dashboard-fns.ts` is the only caller and `dashboard-queries.test.ts` the
  only other reference).
- The detail page's loader data is consumed by its `head()` in a way that the
  added `trend` field disrupts.

## Maintenance notes

- The trend is day-bucketed (last run per day) to match the dashboard's
  x-axis semantics; if sub-day granularity is ever wanted, change the
  bucketing in `getAuditRecord` only — the chart takes any `{date,total}[]`.
- Unlike the dashboard, there is no cap on the number of points (a page with
  50 run-days renders 50 bars). If that ever looks cramped, cap with
  `.slice(-12)` at the query layer, mirroring `MAX_RUN_DATES`.
- Follow-up deliberately deferred: a `TrendChart.test.tsx` component test
  (axis labels, sr-only table) once plan 033's infra exists — the extraction
  makes it trivially testable.
