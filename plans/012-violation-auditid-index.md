# Plan 012: Index `violation.auditId` so dashboard queries stop seq-scanning

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dbd4669..HEAD -- src/db/schema.ts drizzle/`
> If `src/db/schema.ts` changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `dbd4669`, 2026-07-16

## Why this matters

Every dashboard and audit-detail query filters `violation` by `auditId`
(`src/lib/dashboard-queries.ts:56-59` uses `inArray(violation.auditId, ...)`;
`:116-119` uses `eq(violation.auditId, ...)`), and the cascade delete from
`audit` also resolves through it. Postgres does **not** automatically index
foreign-key columns, so each of these is a sequential scan over the whole
`violation` table — fine at 100 rows, painful at 100k. One index fixes it
permanently.

## Current state

- `src/db/schema.ts:108-120` — the `violation` table has no index config:

  ```ts
  export const violation = pgTable("violation", {
    id: text("id").primaryKey(),
    auditId: text("auditId")
      .notNull()
      .references(() => audit.id, { onDelete: "cascade" }),
    ruleId: text("ruleId").notNull(),
    impact: text("impact").$type<Impact>().notNull(),
    help: text("help").notNull(),
    helpUrl: text("helpUrl"),
    description: text("description").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    nodes: jsonb("nodes").$type<ViolationNode[]>().notNull(),
  });
  ```

- The in-repo pattern for table-level indexes is the `audit` table
  (`src/db/schema.ts:71-87`): a third argument
  `(t) => [uniqueIndex("audit_user_url_scanned").on(t.userId, t.url, t.scannedAt)]`.
  `uniqueIndex` is imported from `drizzle-orm/pg-core` at the top of the file;
  plain `index` is **not yet imported**.
- Migration workflow: `pnpm db:generate` (drizzle-kit) writes a new SQL file
  under `drizzle/`; `pnpm db:migrate` or `pnpm db:push` applies it. Existing
  migration: `drizzle/0000_mushy_hellfire_club.sql`.
- **PGlite caution** (from `src/db/index.ts` comments): PGlite is
  single-connection — do not run `db:push`/`db:generate`-with-db while the dev
  server is running against the local `./.data/pglite` database.

## Commands you will need

| Purpose            | Command            | Expected on success |
|--------------------|--------------------|---------------------|
| Install            | `pnpm install`     | exit 0              |
| Typecheck          | `pnpm typecheck`   | exit 0              |
| Generate migration | `pnpm db:generate` | new file in `drizzle/` containing `CREATE INDEX` |
| Tests              | `pnpm test`        | all pass (if plan 009 landed) |

## Scope

**In scope** (the only files you should modify/create):
- `src/db/schema.ts`
- `drizzle/` (generated migration + updated `drizzle/meta/` — generated, do not hand-edit)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/dashboard-queries.ts` — query rewrites are plan 015.
- Any other schema change (columns, other indexes).
- Hand-editing anything under `drizzle/` — only `pnpm db:generate` writes there.

## Git workflow

- Branch: `advisor/012-violation-auditid-index`
- Commit style: short imperative sentence, e.g. "Index violation.auditId for dashboard lookups".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the index to the schema

In `src/db/schema.ts`:
1. Add `index` to the existing `drizzle-orm/pg-core` import.
2. Give `violation` a config callback, matching the `audit` table's style:

```ts
export const violation = pgTable(
  "violation",
  {
    // ... existing columns unchanged ...
  },
  // Every dashboard/detail query filters violations by auditId; Postgres
  // doesn't index FK columns automatically.
  (t) => [index("violation_audit_idx").on(t.auditId)],
);
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Generate and apply the migration

1. Ensure the dev server is **not** running (PGlite single-connection rule).
2. `pnpm db:generate` → a new `drizzle/0001_*.sql` appears.
3. Inspect it: it must contain exactly one statement, shaped like
   `CREATE INDEX "violation_audit_idx" ON "violation" ("auditId");` — nothing
   else (no drops, no table rewrites). If anything else appears, STOP.
4. Apply locally: `pnpm db:push` (or `pnpm db:migrate`).

**Verify**: `grep -l "violation_audit_idx" drizzle/*.sql` → exactly one file.
**Verify**: `pnpm db:push` → exits 0 without prompting for destructive changes.

### Step 3: Confirm the test harness picks it up (only if plan 009 landed)

The plan-009 harness (`src/test/db.ts`) replays all `drizzle/*.sql` in order,
so no harness change is needed. Run the suite to confirm the new migration
applies cleanly to a fresh in-memory database.

**Verify**: `pnpm test` → all pass.

## Test plan

No new tests — an index is behavior-invisible. The existing suite (plan 009)
passing against a schema that includes the new migration is the regression
check. If plan 009 has not landed, the verify steps in step 2 suffice.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `grep -n "violation_audit_idx" src/db/schema.ts` → 1 match
- [ ] `grep -l "violation_audit_idx" drizzle/*.sql` → exactly 1 file, containing only a CREATE INDEX
- [ ] `pnpm db:push` exits 0 against the local database
- [ ] `pnpm test` exits 0 (when a test script exists)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `violation` table in `src/db/schema.ts` doesn't match the excerpt.
- `pnpm db:generate` produces a migration containing anything besides the one
  CREATE INDEX statement (that would mean schema drift is being picked up —
  someone else's uncommitted schema change would ride along).
- `pnpm db:push` warns about data loss or asks to drop anything.

## Maintenance notes

- If production later runs on managed Postgres with existing data, prefer
  `pnpm db:migrate` (applies the SQL file) over `db:push`, and consider
  `CREATE INDEX CONCURRENTLY` manually if the table is already large.
- Plan 015 (dashboard query rewrite) assumes this index exists; keep the name
  `violation_audit_idx` stable.
