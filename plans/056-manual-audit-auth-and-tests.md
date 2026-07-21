# Plan 056: Close the screenshot authorization gap and test the manual-audit auth core

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

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: **the manual-audit feature being committed to `main` first** — see "Prerequisite"
- **Category**: security
- **Planned at**: commit `9930443`, 2026-07-21

## Prerequisite — read before starting

**At the time this plan was written, the manual-audit feature was NOT on
`main`.** It existed only as uncommitted work in the maintainer's working tree,
after being accidentally committed and then deliberately un-committed (see the
`plans/README.md` note for the 051–057 generation).

Before starting, verify the files exist and are tracked:

```
git ls-files src/lib/manual-audit.ts src/routes/api/manual/ | wc -l
```

**Expected: 9** — `manual-audit.ts`, 7 route files, and
`src/routes/api/manual/manual.test.ts`. If it returns 0, the feature has not
landed yet — **STOP and report**. Do not recreate the files from this plan's
excerpts; they are excerpts, not the whole implementation.

If it returns 8, check whether the missing file is `manual.test.ts`. This plan
assumes that suite exists and adds to it; without it, do Step 4 as a new file
instead and say so in your status note.

## Why this matters

The `/api/manual/**` surface is the internal auditor product: an auditor with
`user.isAuditor` assembles a page sample for a customer, works a WCAG-EM
checklist, and logs findings with screenshots. Six of its seven routes check
that the acting auditor owns the audit they are writing to. One does not.

`src/routes/api/manual/screenshots.$key.ts` checks only that the caller is *an*
auditor, then serves the file. Its own comment says so:

> Auditor-only **for now**; ... keys are unguessable UUIDs, but that is not an
> authorization story on its own.

The schema supports multiple auditors (`manualAudit.auditorUserId`), each
presumably working different client engagements, and screenshots are cropped
images of customer pages — potentially confidential content. Any auditor
account can currently read any other auditor's screenshot given its key.

**A test suite for these routes now exists** at
`src/routes/api/manual/manual.test.ts` (added by the maintainer after this
generation's audit ran, which is why some notes elsewhere still say "zero
tests" — that is stale). It covers the auth core well: non-auditors and revoked
keys rejected across five routes, and one auditor's audit hidden from another.

It does **not** cover the gap this plan closes. Its screenshot test stores an
image and serves it back **as the auditor who owns it**, asserting 200. There
is no case for a *different* auditor requesting the same key — which is exactly
the vulnerability.

After this plan: the screenshot route enforces ownership like its siblings, and
that enforcement has a regression test in the existing suite.

## Current state

### The gap — `src/routes/api/manual/screenshots.$key.ts` (whole file)

```ts
import { createFileRoute } from "@tanstack/react-router";
import { json, readScreenshot, requireAuditor } from "@/lib/manual-audit";

// GET /api/manual/screenshots/$key — serve a finding's screenshot. Auditor-only
// for now; when the customer dashboard renders findings it will need its own
// session-cookie path that checks the audit's userId (keys are unguessable
// UUIDs, but that is not an authorization story on its own).

export const Route = createFileRoute("/api/manual/screenshots/$key")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);

        const data = await readScreenshot(params.key);
        if (!data) return json({ error: "Not found" }, 404);
        return new Response(new Uint8Array(data), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
```

### The pattern every other route follows

From `src/routes/api/manual/findings.ts:69-78`:

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

### The auth core — `src/lib/manual-audit.ts:41-75`

```ts
export async function requireAuditor(request: Request): Promise<{ userId: string } | null> {
  let userId: string | null = null;

  const token = bearerToken(request);
  if (token) {
    const hashed = await hashKey(token);
    const [row] = await db
      .select({ userId: apiKey.userId, revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(eq(apiKey.hashedKey, hashed))
      .limit(1);
    if (!row || row.revokedAt) return null;
    userId = row.userId;
  } else {
    const session = await auth.api.getSession({ headers: request.headers });
    userId = session?.user.id ?? null;
  }
  if (!userId) return null;

  const [who] = await db
    .select({ isAuditor: user.isAuditor })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return who?.isAuditor ? { userId } : null;
}

/**
 * Fetches an audit only if this auditor owns it — the authorization check for
 * every nested write (pages, checks, findings, dismissals).
 */
export async function auditForAuditor(auditId: string, auditorUserId: string) {
  const [row] = await db.select().from(manualAudit).where(eq(manualAudit.id, auditId)).limit(1);
  return row && row.auditorUserId === auditorUserId ? row : null;
}
```

### The screenshot store — `src/lib/manual-audit.ts:103-111`

```ts
export async function readScreenshot(key: string): Promise<Buffer | null> {
  // Belt-and-braces: keys are our UUIDs, but never join caller input blindly.
  if (!/^[0-9a-f-]+\.png$/.test(key)) return null;
  try {
    return await readFile(join(screenshotDir(), key));
  } catch {
    return null;
  }
}
```

**The path-traversal defence here is correct** — the pattern is anchored, so no
`/` or `..` survives. Do not "improve" it; it is not the gap.

The screenshot key is stored on `manualFinding.screenshotKey`. Confirm the
exact column name in `src/db/schema.ts` before writing the join in Step 2.

### Conventions this repo uses — match them

- **Tests use a real in-memory Postgres**, not mocks. `src/test/db.ts` exports
  `createTestDb()`, which replays every `drizzle/*.sql` into PGlite.
- **Route tests must import anything touching `@/db` dynamically** inside
  `beforeAll`, after `createTestDb()` has run. `@/db` memoizes a connection on
  first import, and a static top-level import binds it to the persisted
  `./.data/pglite` before the test database exists. This bit two previous plans
  (037, 043). See `src/routes/api/ingest.test.ts` for the working pattern.
- **`createTestDb()` must not run twice in one file** — the module under test
  keeps querying the first instance. Existing files share one via
  `db ??= await createTestDb()`.
- **Fixture ids are short and namespaced per describe block** to avoid
  `user_pkey` collisions in a shared database (e.g. `hak-*` in
  `account-fns.test.ts`). Follow that.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Generate routes | `pnpm generate-routes` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Targeted tests | `pnpm vitest run src/lib/manual-audit.test.ts` | all pass |
| Full suite | `pnpm test` | all pass |
| Build | `pnpm build` | exit 0 |

Run `nvm use` first — `.nvmrc` pins Node 24.

## Scope

**In scope**:

- `src/routes/api/manual/screenshots.$key.ts`
- `src/lib/manual-audit.ts` (add one lookup helper only)
- `src/routes/api/manual/manual.test.ts` (add cases to the existing suite —
  do not rewrite or reorganise what is already there)

**Out of scope** (do NOT touch, even though they look related):

- The other six route files — plan 057 restructures them, and per-route
  behaviour tests belong there. Touching them here creates a conflict.
- `readScreenshot`'s key regex — already correct.
- `saveScreenshot` and the filesystem store generally. Note it defaults to
  `./.data/screenshots`, which is ephemeral on Railway; that is a real issue
  and a separate one.
- The `isAuditor` grant path. Nothing in the codebase sets it to `true`; that
  is a deliberate gap for a future admin flow, not this plan's problem.
- `src/db/schema.ts` — no schema change is needed here.

## Git workflow

- Work directly on `main` — this repo does not use feature branches (see
  `CLAUDE.md`). Do not open a PR.
- Commit message style: imperative subject, blank line, prose body explaining
  *why*. Recent example: `Add security headers to every response`.
- Do **not** push. Leave the commit local for review.

## Steps

### Step 1: Confirm the prerequisite

Run the `git ls-files` check from "Prerequisite". **Expected: 8.**

**Verify**: 8 tracked files. If 0, STOP.

### Step 2: Add an ownership-aware screenshot lookup

In `src/lib/manual-audit.ts`, add a helper beside `auditForAuditor`:

```ts
/**
 * Resolves a screenshot key to its owning audit, but only for the auditor who
 * owns that audit. Returns null otherwise, so the route can 404 without
 * distinguishing "no such key" from "not yours" — same reasoning as
 * requireAuditor not distinguishing an unknown key from a non-auditor.
 */
export async function screenshotForAuditor(
  key: string,
  auditorUserId: string,
): Promise<boolean>
```

Implement it as a join from `manualFinding.screenshotKey = key` to
`manualAudit`, filtered on `manualAudit.auditorUserId = auditorUserId`, with
`.limit(1)`. Return whether a row was found.

Check the exact column names in `src/db/schema.ts` before writing this — do
not assume from this plan's prose.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Enforce it in the route

In `src/routes/api/manual/screenshots.$key.ts`, add the ownership check
between the auth check and the file read:

```ts
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);

        // Every other manual route checks the acting auditor owns the audit it
        // is touching; this one served any auditor any key. An unguessable key
        // is not an authorization story.
        if (!(await screenshotForAuditor(params.key, who.userId))) {
          return json({ error: "Not found" }, 404);
        }

        const data = await readScreenshot(params.key);
```

Also update the file's header comment: it currently describes this gap as a
known future task, which will no longer be true.

**Verify**: `pnpm typecheck` and `pnpm lint` → exit 0.

### Step 4: Add the missing cases to the existing suite

Read `src/routes/api/manual/manual.test.ts` first. It already provides
everything you need: a `handlers` map built by dynamically importing each route
module, a `request(method, body?, key?)` helper, two seeded auditor users
(`u-auditor` and `u-other`) with their API keys, a non-auditor "civilian" key,
and `createAudit()` / `addPage()` fixtures. **Reuse those. Do not build a
parallel harness.**

Note the existing test `"stores a screenshot and serves it back; oversize is
rejected"` — it creates a finding with `screenshotBase64` and reads back
`finding.screenshotKey`. Your new cases follow the same setup.

Add these cases:

1. **Cross-auditor screenshot access returns 404.** Create a finding with a
   screenshot as the owning auditor, then request that same key with
   `OTHER_AUDITOR_KEY`. Expect **404**, not 200. *This is the regression test
   for the vulnerability this plan closes — write it first and watch it fail
   before Step 3's fix, so you know it is real.*
2. **An unknown screenshot key returns 404** for a legitimate auditor.
3. **A traversal-shaped key returns 404** rather than reading a file — e.g.
   `../../etc/passwd`. `readScreenshot`'s anchored pattern already handles
   this; the test pins it so a future "improvement" to that regex cannot
   silently open it.
4. **The owning auditor still gets 200.** The existing test covers this, so
   only add a case if your change to the handler makes the existing one
   ambiguous. Prefer not duplicating it.

**Verify**: `pnpm vitest run src/routes/api/manual/manual.test.ts` → all pass,
including the 3 new cases, with the pre-existing tests unmodified.

### Step 5: Full gate

**Verify**, in order, all exit 0:

```
pnpm generate-routes
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Test plan

- **New tests**: 3 added to the existing
  `src/routes/api/manual/manual.test.ts`, listed in Step 4. Case 1 is the one
  this plan exists for — write it before the fix and confirm it fails.
- **Structural pattern**: the file itself. It already dynamically imports each
  route module inside `beforeAll` (required — `@/db` memoizes its connection on
  first import, so a static top-level import binds it to the persisted
  `./.data/pglite` before `createTestDb()` runs), seeds two auditors plus a
  non-auditor, and exposes `request()`/`createAudit()`/`addPage()` helpers.
- **Do not add a second `createTestDb()` call.** The file already has one and
  the module under test binds its `db` import once.
- **Verification**: `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `git ls-files src/lib/manual-audit.ts src/routes/api/manual/ | wc -l` returns 9
- [ ] `src/routes/api/manual/manual.test.ts` passes, with 3 new cases and every
      pre-existing case unmodified (`git diff` shows additions only)
- [ ] The cross-auditor screenshot case fails against the unfixed handler
      (confirm by stashing the Step 3 change, or state that you verified it
      before applying the fix)
- [ ] `grep -n "screenshotForAuditor" src/routes/api/manual/screenshots.\$key.ts` returns at least one match
- [ ] `grep -n "for now" src/routes/api/manual/screenshots.\$key.ts` returns no match (the stale comment is gone)
- [ ] The other six route files are unmodified (`git status --short`)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all exit 0
- [ ] `plans/README.md` status row for 056 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The prerequisite check returns 0 tracked files. The feature has not landed;
  this plan cannot run.
- The column names in `src/db/schema.ts` do not match what Step 2 assumes
  (`manualFinding.screenshotKey`, `manualAudit.auditorUserId`). Report the
  actual names rather than guessing at a join.
- The cross-auditor screenshot test **passes before you apply Step 3's fix**.
  That would mean either the test is not exercising what you think, or the gap
  was closed some other way — either way, stop and work out which.
- Any test needs `createTestDb()` called a second time in the same file.
- You find yourself reorganising the existing `manual.test.ts` rather than
  adding to it. It was written by the maintainer; keep the diff additive.

## Maintenance notes

For whoever owns this next:

- **The customer-facing path does not exist yet.** The original comment
  anticipated a second access path for customers viewing their own findings,
  checking `manualAudit.userId` rather than `auditorUserId`. When that is
  built, it needs its own ownership helper — do not loosen
  `screenshotForAuditor` to serve both.
- **Screenshots live on ephemeral storage.** `screenshotDir()` defaults to
  `./.data/screenshots`, which on Railway does not survive a redeploy. The
  module comment already anticipates swapping in S3/R2 behind
  `saveScreenshot`/`readScreenshot`. That is a real gap this plan does not
  address.
- **`SCREENSHOT_DIR` is absent from `.env.example`.** Worth adding whenever
  this feature is next touched.
- A reviewer should check one thing: that the ownership check runs **before**
  `readScreenshot`, so a non-owner cannot distinguish "exists" from "doesn't"
  by timing or status code.
