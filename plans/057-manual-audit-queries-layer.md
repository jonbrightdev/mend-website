# Plan 057: Move the manual-audit routes onto the repo's queries layer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9930443..HEAD -- src/lib/manual-audit.ts src/routes/api/manual/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/056-manual-audit-auth-and-tests.md` — **do not start
  this before 056 has landed.** 056 builds the test suite that makes this
  refactor verifiable; doing the refactor first means restructuring untested
  code.
- **Category**: tech-debt
- **Planned at**: commit `9930443`, 2026-07-21

## Prerequisite — read before starting

Same as 056. Verify the feature is on `main`:

```
git ls-files src/lib/manual-audit.ts src/routes/api/manual/ | wc -l
```

**Expected: 9** — `manual-audit.ts`, 7 route files, and
`src/routes/api/manual/manual.test.ts`. If 0, STOP — the feature has not
landed.

Also verify 056 is done, by checking its fix is present:

```
grep -c "screenshotForAuditor" src/routes/api/manual/screenshots.\$key.ts
```

**Expected: ≥1.** If 0, STOP and run 056 first — it builds the ownership check
and the regression test that make this refactor safe to verify.

## Why this matters

Every other feature area in this repo keeps database access in a `-queries.ts`
module and lets routes/`-fns.ts` call named functions:
`account-fns.ts`/`account-queries.ts`, `dashboard-fns.ts`/`dashboard-queries.ts`,
`monitor-fns.ts`/`monitor-queries.ts`, `billing-queries.ts`.

The manual-audit routes do not. Six of the seven import `db` and the schema
directly and build Drizzle queries inline inside the HTTP handler. The
consequences are concrete:

- **The authorization check is copy-pasted three times.** The "this page
  belongs to this audit" query appears verbatim in `checks.ts`, `dismissals.ts`
  and `findings.ts`. It is the authorization boundary for every nested write,
  and a copy-paste slip in one of them is a cross-audit IDOR.
- **Query logic cannot be tested without HTTP plumbing.**
- **JSON body parsing is duplicated** four times with a near-identical
  400-on-bad-JSON block.

After this plan the queries live in one module, the ownership check exists
once, and the routes are thin.

## Current state

### The triplicated ownership check

Identical in `src/routes/api/manual/checks.ts:50-57`,
`src/routes/api/manual/dismissals.ts:47-54`, and
`src/routes/api/manual/findings.ts:71-78`:

```ts
        const audit = await auditForAuditor(auditId, who.userId);
        if (!audit) return json({ error: "Not found" }, 404);
        const [page] = await db
          .select({ id: manualAuditPage.id })
          .from(manualAuditPage)
          .where(
            and(eq(manualAuditPage.id, pageId), eq(manualAuditPage.manualAuditId, audit.id)),
          )
          .limit(1);
        if (!page) return json({ error: "Page not in this audit" }, 404);
```

### The duplicated body parse

In `audits.ts:31-41`, `checks.ts:22-33`, `dismissals.ts:19-30` (and a
`request.text()` variant in `findings.ts:37-46`):

```ts
        let body: Record<string, unknown>;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }
```

### The exemplar to match

`src/lib/monitor-queries.ts` is the closest structural analogue: server-only
module, named async functions taking plain arguments, returning rows. Read it
before starting and match its shape, naming, and comment density.

Note which of the seven routes is already correct:
`src/routes/api/manual/screenshots.$key.ts` goes through
`@/lib/manual-audit`'s `readScreenshot` and imports no `db`. It shows the split
is achievable here.

### Conventions this repo uses — match them

- **Server-only import protection.** A *value* exported from a module that
  imports `@/db`, if it reaches client code, fails `pnpm build`. Plan 043 hit
  exactly this: a value re-export from `monitor-queries` survived into the
  client bundle. These are API routes so the risk is low, but `pnpm build`
  is the check that proves it and it is in the gate.
- **`export type` is erased; a value export is not.** If you need a row type in
  a route, export it as a type.
- **Comments explain *why*.**
- **Tests use real PGlite** via `createTestDb()`; anything touching `@/db` is
  imported dynamically inside `beforeAll`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Generate routes | `pnpm generate-routes` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Targeted tests | `pnpm vitest run src/lib/manual-audit.test.ts src/lib/manual-queries.test.ts` | all pass |
| Full suite | `pnpm test` | all pass |
| Build | `pnpm build` | exit 0 |

Run `nvm use` first — `.nvmrc` pins Node 24.

## Scope

**In scope**:

- `src/lib/manual-queries.ts` (create)
- `src/lib/manual-queries.test.ts` (create)
- `src/lib/manual-audit.ts` (add `parseJsonBody`; move db queries out)
- `src/routes/api/manual/audits.ts`
- `src/routes/api/manual/audits.$auditId.ts`
- `src/routes/api/manual/audits.$auditId.pages.ts`
- `src/routes/api/manual/checks.ts`
- `src/routes/api/manual/dismissals.ts`
- `src/routes/api/manual/findings.ts`

**Out of scope** (do NOT touch, even though they look related):

- `src/routes/api/manual/screenshots.$key.ts` — already follows the pattern,
  and 056 just changed it. Leave it.
- **Any change to a route's request or response shape.** The
  `mend-manual-helper` extension depends on the exact JSON contract, and that
  extension is not in this repo — you cannot see or update its expectations.
  This is a pure internal restructuring. Status codes, field names, and error
  strings must all stay byte-identical.
- `src/db/schema.ts` — no schema change.
- The CORS headers and `json()` helper in `manual-audit.ts`.
- Authorization *semantics*. You are moving the check into one place, not
  changing what it permits.

## Git workflow

- Work directly on `main` — this repo does not use feature branches (see
  `CLAUDE.md`). Do not open a PR.
- Commit message style: imperative subject, blank line, prose body explaining
  *why*. Recent example: `Add security headers to every response`.
- **Commit per route file**, not one big commit. If a response shape changes by
  accident, a per-file history makes it findable.
- Do **not** push.

## Steps

### Step 1: Confirm prerequisites

Run both checks from "Prerequisite".

**Verify**: 8 tracked files, and `src/lib/manual-audit.test.ts` present.
If either fails, STOP.

### Step 2: Capture the current contract

Before moving anything, write down each route's responses so you can prove they
did not change. For each of the six in-scope routes, record: the success status
and body shape, and every error status/message string.

Put this in the plan's status note when you update `plans/README.md`. It is
also your own regression checklist.

**Verify**: you have a written list covering all six routes.

### Step 3: Create `manual-queries.ts`

Create `src/lib/manual-queries.ts`, modelled on `src/lib/monitor-queries.ts`.

Move the Drizzle calls out of the routes into named functions. At minimum:

- `pageInAudit(pageId: string, auditId: string)` — the triplicated check,
  returning the page row or null.
- The audit list/create queries from `audits.ts`.
- The audit read/status-update queries from `audits.$auditId.ts`.
- The page queries from `audits.$auditId.pages.ts`.
- The check upsert from `checks.ts`.
- The finding insert from `findings.ts`.
- The dismissal insert from `dismissals.ts`.

`requireAuditor` and `auditForAuditor` may stay in `manual-audit.ts` (they are
auth, not data access) or move — pick one and be consistent. If they stay,
`manual-audit.ts` keeps its `@/db` import, which is fine.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Add `parseJsonBody` to `manual-audit.ts`

```ts
/**
 * Parses a JSON body, or returns the 400 the routes all used to build inline.
 * Returns a discriminated result rather than throwing so handlers stay flat.
 */
export async function parseJsonBody(
  request: Request,
): Promise<{ body: Record<string, unknown> } | { response: Response }>
```

Note `findings.ts` currently uses `request.text()` and parses separately —
check why before collapsing it into the same helper. If it is reading the raw
body for a size check, preserve that behaviour.

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Convert the routes, one at a time

In this order (simplest first): `audits.$auditId.pages.ts`, `dismissals.ts`,
`checks.ts`, `audits.$auditId.ts`, `audits.ts`, `findings.ts`.

For each: replace inline queries with `manual-queries.ts` calls, replace the
body-parse block with `parseJsonBody`, and **change nothing else**.

After each file:

**Verify**: `pnpm typecheck` → exit 0, `pnpm test` → all pass, and
`grep -n "from \"@/db\"" <the file>` → no match.

### Step 6: Test the queries module

Create `src/lib/manual-queries.test.ts`, modelled on
`src/lib/monitor-queries.test.ts` (real PGlite, dynamic imports).

Priority cases — the authorization ones first:

1. `pageInAudit` returns the page when it belongs to the audit.
2. `pageInAudit` returns null when the page belongs to a **different** audit.
   This is the regression guard for the check that was copy-pasted three times.
3. `pageInAudit` returns null for an unknown page id.
4. One happy-path test per moved write query (check upsert, finding insert,
   dismissal insert) confirming the row lands with the expected fields.
5. The check upsert is idempotent on `(pageId, sc)` — the schema has a unique
   index there, so a second write must update rather than error.

**Verify**: `pnpm vitest run src/lib/manual-queries.test.ts` → all pass.

### Step 7: Prove the contract held

Re-read your Step 2 list against the converted routes. Every status code and
error string must match.

**Verify**: `grep -rn "from \"@/db\"" src/routes/api/manual/` → **no matches**.
Then the full gate:

```
pnpm generate-routes
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Test plan

- **New tests**: at least 8 in `src/lib/manual-queries.test.ts` (Step 6).
  Cases 2 and 5 are the ones that earn their keep.
- **Structural pattern**: `src/lib/monitor-queries.test.ts`.
- **`src/routes/api/manual/manual.test.ts` must pass unchanged.** It exercises
  all six in-scope routes end-to-end through their handlers — auth rejection,
  cross-auditor isolation, the check/finding interaction, screenshot storage,
  dismissal validation — which makes it the real safety net for this refactor.
  If any case there fails, you changed behaviour, and that is a STOP.
- **Verification**: `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "from \"@/db\"" src/routes/api/manual/` returns no matches
- [ ] `src/lib/manual-queries.ts` and `src/lib/manual-queries.test.ts` exist
- [ ] `pnpm vitest run src/lib/manual-queries.test.ts` passes with ≥8 tests
- [ ] `src/routes/api/manual/manual.test.ts` passes **unchanged** (`git diff` on it is empty)
- [ ] `src/routes/api/manual/screenshots.$key.ts` is unmodified
- [ ] The `pageInAudit` query text appears exactly once in the codebase
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all exit 0
- [ ] `plans/README.md` status row for 057 updated, including the Step 2
      contract list

## STOP conditions

Stop and report back (do not improvise) if:

- Either prerequisite check fails.
- Any route's response shape, status code, or error string would change. The
  `mend-manual-helper` extension is not in this repo and cannot be updated in
  lockstep — a contract change here breaks it silently and remotely.
- `pnpm build` fails after extracting the queries module. That means a value
  export reached the client bundle (see plan 043's note); report it rather than
  sprinkling `type` keywords until it passes.
- A test from 056 fails. This plan must not change auth behaviour.
- `findings.ts`'s `request.text()` usage turns out to be load-bearing for a
  size check and does not fit `parseJsonBody`. Leave it inline and say so.

## Maintenance notes

For whoever owns this next:

- **The `mend-manual-helper` extension is the hidden dependency.** It lives
  outside both this repo and `../mend-a11y` — nothing here can verify the
  contract. Treat every one of these routes' response shapes as a published
  API until someone confirms otherwise.
- **`pageInAudit` is an authorization primitive, not a convenience.** It is
  what stops an auditor writing a finding onto another audit's page. Any change
  to it needs the mismatch test in Step 6 to keep passing.
- A reviewer should diff each route's error strings against the pre-refactor
  version specifically. Everything else about this change is mechanical; the
  strings are where a silent contract break would hide.
