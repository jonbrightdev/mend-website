# Plan 010: Make ingest write the audit and its violations atomically

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dbd4669..HEAD -- src/routes/api/ingest.ts src/db/schema.ts`
> If an in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Exception: plan 009 moves
> `parsePayload`/`groupViolations` out of the route into
> `src/lib/ingest-payload.ts` — that exact change is expected and fine.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/009-test-and-ci-baseline.md (for the test harness; the code change itself is independent)
- **Category**: bug
- **Planned at**: commit `dbd4669`, 2026-07-16

## Why this matters

`POST /api/ingest` (the endpoint the Mend Chrome extension syncs audit runs to)
inserts the `audit` row and its `violation` rows as **two separate awaited
statements**. If the process crashes or the second insert fails, the audit is
recorded with zero violations — the dashboard shows the page as clean. Worse,
the failure is *permanent*: ingest is idempotent via a unique index on
`(userId, url, scannedAt)` with `onConflictDoNothing()`, so when the extension
retries the same run, the conflict path returns `{ duplicate: true }` and the
missing violations are never written. Wrapping both writes in one transaction
removes the failure window entirely.

## Current state

- `src/routes/api/ingest.ts` — the ingest endpoint. The POST handler's write
  section (as of commit `dbd4669`, lines 215–241):

  ```ts
  const auditId = crypto.randomUUID();
  const inserted = await db
    .insert(audit)
    .values({
      id: auditId,
      userId,
      url: payload.url,
      pageTitle: payload.pageTitle,
      scannedAt: payload.scannedAt,
      durationMs: payload.durationMs,
      totalChecks: payload.totalChecks,
      partial: payload.partial,
    })
    .onConflictDoNothing()
    .returning();

  // Same (user, url, scannedAt) already stored: idempotent success.
  if (inserted.length === 0) {
    return json({ duplicate: true }, 200);
  }

  const violations = groupViolations(auditId, payload.issues);
  if (violations.length > 0) {
    await db.insert(violation).values(violations);
  }

  return json({ auditId, violations: violations.length }, 201);
  ```

- `src/db/schema.ts:86` — the idempotency index:
  `uniqueIndex("audit_user_url_scanned").on(t.userId, t.url, t.scannedAt)`.
- `src/db/index.ts` — `db` is a Drizzle instance over either `node-postgres`
  (when `DATABASE_URL` is set) or PGlite (embedded). **Both drivers support
  `db.transaction(async (tx) => { ... })`** — the standard Drizzle API.
- `src/test/db.ts` (created by plan 009) — in-memory PGlite harness:
  `createTestDb()` returns a Drizzle db and assigns it to
  `globalThis.__mendDb` so `@/db` resolves to it.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `pnpm install`   | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |

## Scope

**In scope** (the only files you should modify/create):
- `src/routes/api/ingest.ts`
- `src/routes/api/ingest.test.ts` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- The `lastUsedAt` update inside `resolveUserId` — it is a best-effort
  bookkeeping write and intentionally stays outside the transaction.
- `src/db/schema.ts`, the response shapes, and the CORS/auth logic.
- Input validation limits — that is plan 011.

## Git workflow

- Branch: `advisor/010-transactional-ingest`
- Commit style: short imperative sentence, e.g. "Write ingest audit and violations in one transaction".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Wrap the writes in `db.transaction`

In the POST handler, replace the write section with a single transaction that
preserves the existing behavior exactly (same responses, same idempotency):

```ts
const auditId = crypto.randomUUID();
const result = await db.transaction(async (tx) => {
  const inserted = await tx
    .insert(audit)
    .values({
      id: auditId,
      userId,
      url: payload.url,
      pageTitle: payload.pageTitle,
      scannedAt: payload.scannedAt,
      durationMs: payload.durationMs,
      totalChecks: payload.totalChecks,
      partial: payload.partial,
    })
    .onConflictDoNothing()
    .returning();

  // Same (user, url, scannedAt) already stored: idempotent success.
  if (inserted.length === 0) return { duplicate: true as const };

  const violations = groupViolations(auditId, payload.issues);
  if (violations.length > 0) {
    await tx.insert(violation).values(violations);
  }
  return { duplicate: false as const, count: violations.length };
});

if (result.duplicate) return json({ duplicate: true }, 200);
return json({ auditId, violations: result.count }, 201);
```

Keep the existing comment about idempotency; add one line above the
transaction stating why atomicity matters (a partial write would be permanent
because retries hit the conflict path).

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Tests

Create `src/routes/api/ingest.test.ts` using the plan-009 harness. Structure:
call `createTestDb()` in a top-level `beforeAll` **before** dynamically
importing anything that touches `@/db`, then `await import("@/db")` and
`await import("@/db/schema")` for direct table access. Seed one `user` row
(plain insert with a fixed id) — `audit.userId` has a foreign key to it.

Cases:

1. **Atomic success**: insert an audit + violations through
   `db.transaction` the way the handler does (or, if the route handler can be
   invoked directly with a constructed `Request`, prefer that — check whether
   `Route.options.server.handlers.POST` is callable in a plain Vitest node
   environment; if it is not trivially callable, test at the `db.transaction`
   level and say so in a comment). Assert both tables contain the rows.
2. **Rollback**: run a `db.transaction` that inserts an `audit` row and then
   throws. Assert the transaction rejects AND `select` from `audit` returns
   zero rows — proving the driver-level rollback that the fix relies on works
   on PGlite.
3. **Idempotency preserved**: insert the same `(userId, url, scannedAt)` audit
   twice with `.onConflictDoNothing().returning()`; the second returns an
   empty array and the table still has exactly one row.

**Verify**: `pnpm test` → all pass, including the 3 new tests.

## Test plan

See step 2. Model structure on the plan-009 test files (`describe` per
behavior, no mocks — real in-memory Postgres).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0, including 3 new tests in `src/routes/api/ingest.test.ts`
- [ ] `grep -n "db.transaction" src/routes/api/ingest.ts` → exactly 1 match
- [ ] The two success responses are unchanged: `grep -n "duplicate: true" src/routes/api/ingest.ts` still matches, and the 201 body still contains `auditId` and `violations`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The write section in `src/routes/api/ingest.ts` no longer matches the
  excerpt (beyond plan 009's expected extraction of `groupViolations`).
- `db.transaction` does not exist on the `db` type or throws
  "transactions are not supported" at runtime on either driver path.
- The rollback test (case 2) fails — that would mean PGlite transactions do
  not roll back as assumed, which invalidates the whole approach.

## Maintenance notes

- Plan 011 (ingest limits) edits the same handler — land this first; 011's
  validation happens before the transaction so the two compose cleanly.
- If ingest ever starts writing more tables (e.g. per-rule stats), those
  writes belong inside this same transaction.
- Reviewer: confirm no response-shape change — the extension depends on
  `{ duplicate: true }` / `{ auditId, violations }`.
