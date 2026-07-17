# Plan 025: Account data export — download my audits as JSON

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb1bec2..HEAD -- src/lib/account-fns.ts src/components/AccountClient.tsx src/db/schema.ts`
> If the danger-zone section of `AccountClient.tsx` or the schema changed
> since this plan was written, compare the "Current state" notes against the
> live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (plan 014's danger zone already landed)
- **Category**: privacy / feature
- **Planned at**: commit `cb1bec2`, 2026-07-17

## Why this matters

Plan 014 gave users deletion (all audits, or the whole account) and a
retention story on the privacy page. The complement is missing: a user cannot
take their data *out*. For a product whose pitch includes trust ("your scans,
your data"), GDPR-style portability — one click, one JSON file — completes
the pair, and the plans README lists it as the follow-up pairing with 014's
danger zone.

## Design decisions (already made — do not re-litigate)

- **A GET route, `src/routes/api/export.ts`**, session-cookie auth only.
  API keys are for the extension's ingest writes; export is a browser action
  from the account page, so `auth.api.getSession({ headers })` is the guard
  and there are **no CORS headers** (same-origin only — unlike ingest).
- **Build the JSON in memory.** Plan 011's caps bound what any one audit can
  hold, and 024 bounds arrival rate; a user's corpus is megabytes, not
  gigabytes. Streaming is a future concern, noted, not built.
- **Included**: profile (name, email, createdAt), API-key *metadata* (name,
  createdAt, lastUsedAt, revokedAt — ids and hashes stay server-side),
  every audit run with its violations (full nodes payload — that is the
  user's data).
- **Excluded**: sessions, OAuth account rows, verification tokens — server
  bookkeeping, not user content; hashes of any kind.
- **Download via a plain link** (`<a href="/api/export">`) with
  `Content-Disposition: attachment` — no client fetch/blob machinery.

## Current state

- `src/lib/account-fns.ts` — server functions for the account page;
  `deleteAllAudits` (`:100-107`) shows the owner-scoping idiom
  (`eq(audit.userId, user.id)` is the entire security boundary).
  `currentSessionUser()` from `@/lib/session` guards server *functions*; a
  raw route handler instead uses `auth.api.getSession({ headers })` — see
  `resolveUserId` in `src/routes/api/ingest.ts:73-74` for that call.
- `src/components/AccountClient.tsx:168-333` — `DangerZone()` renders
  `<section className="panel panel--danger" aria-labelledby="danger-h">` with
  the two destructive actions.
- `src/db/schema.ts` — `audit` (`:72-88`), `violation` (`:109-128`, `nodes`
  jsonb), `apiKey` (`:94-104`).
- Existing per-user read patterns: `getDashboardData` in
  `src/lib/dashboard-queries.ts` (owner-scoped selects, violations joined via
  `auditId`). The export wants *all* runs + *all* violations — simpler than
  the dashboard's latest-per-URL shaping, so write a dedicated function
  rather than bending that one.
- Route-with-handlers pattern: `src/routes/api/ingest.ts`
  (`createFileRoute("/api/ingest")({ server: { handlers: { ... } } })`).
- `pnpm generate-routes` regenerates `src/routeTree.gen.ts` after adding a
  route file (it is gitignored; typecheck fails without regeneration).

## Commands you will need

| Purpose         | Command               | Expected on success |
|-----------------|-----------------------|---------------------|
| Regen routes    | `pnpm generate-routes`| exit 0              |
| Typecheck       | `pnpm typecheck`      | exit 0              |
| Tests           | `pnpm test`           | all pass            |
| Dev run         | `pnpm dev`            | serves on :3000     |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/export-data.ts` (new — server-only query + shaping)
- `src/lib/export-data.test.ts` (new)
- `src/routes/api/export.ts` (new — thin handler)
- `src/routes/api/export.test.ts` (new — auth guard test)
- `src/components/AccountClient.tsx` (the download link)
- `src/routes/privacy.tsx` (one sentence, only if a retention section exists)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/dashboard-queries.ts` — do not reshape it for export.
- Any CSV/ZIP format, date-range filters, or async "email me my export"
  flow.
- `src/lib/account-fns.ts` — export is a route, not a server function.

## Git workflow

Work directly on `main` (per CLAUDE.md). Commit style: short imperative
sentence, e.g. "Add JSON export of account data". Run the full CI check list
before pushing.

## Steps

### Step 1: The export builder

New file `src/lib/export-data.ts` (server-only banner comment, like
`dashboard-queries.ts`). One exported function:

```ts
export async function buildExport(userId: string): Promise<ExportBundle>
```

Shape (also export the type):

```ts
{
  format: "mend-export/v1",
  exportedAt: string,           // ISO, now
  user: { name, email, createdAt },
  apiKeys: [{ name, createdAt, lastUsedAt, revokedAt }],   // no ids, no hashes
  audits: [{
    url, pageTitle, scannedAt, durationMs, totalChecks, partial,
    violations: [{ ruleId, impact, help, helpUrl, description, tags, nodes }],
  }],
}
```

Queries: user row by id; apiKey rows by userId; audit rows by userId ordered
`scannedAt` asc; violation rows via `innerJoin(audit, eq(violation.auditId,
audit.id)).where(eq(audit.userId, userId))` — one query, grouped in JS by
`auditId`. Every `where` clause is owner-scoped; that is the security
boundary, same as `deleteAllAudits`.

Tests (`export-data.test.ts`, `createTestDb()` + dynamic-import pattern from
`ingest.test.ts`): seed two users with audits/violations/keys; assert user A's
bundle contains exactly A's audits with violations attached, key metadata
without `hashedKey`/`id` fields (`expect(bundle.apiKeys[0]).not.toHaveProperty("id")`),
and none of B's data.

**Verify**: `pnpm test` → new file passes.

### Step 2: The route

New file `src/routes/api/export.ts`:

```ts
GET: async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const bundle = await buildExport(session.user.id);
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mend-export-${bundle.exportedAt.slice(0, 10)}.json"`,
    },
  });
},
```

No OPTIONS handler, no CORS headers (deliberate — see design decisions).

Then `pnpm generate-routes`.

Route test (`export.test.ts`): a request with no cookie → 401. (The
signed-cookie session path can't be forged in a unit test cheaply; the
authenticated path is covered by Step 1's tests plus Step 4's manual check.)

**Verify**: `pnpm generate-routes && pnpm typecheck` → exit 0; `pnpm test` →
all pass.

### Step 3: The account-page link

In `AccountClient.tsx`, inside the `DangerZone` section but **above** the
destructive actions, add a short non-destructive block: heading like
"Export your data", one sentence ("Download everything Mend has stored for
your account — audits, violations, and API-key names — as JSON."), and
`<a className="btn btn--ghost" href="/api/export">Download JSON</a>` (match
the button classes already used in that file — check neighbours before
inventing one).

If `src/routes/privacy.tsx` has the plan-014 retention section, add one
sentence there noting data can be downloaded from the account page. If no
such section exists, skip — do not restructure the privacy page.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Manual end-to-end

`pnpm dev`, sign in, sync or seed at least one audit, click "Download JSON"
on `/account`. Confirm: browser downloads `mend-export-<date>.json`; the file
parses; it contains the audit and no `hashedKey` string anywhere
(`grep -c hashedKey <file>` → 0). Signed out, `curl -i localhost:3000/api/export`
→ 401.

## Test plan

Steps 1–2 tests plus the Step 4 manual pass. The isolation test (user A never
sees user B) is the one that must never be skipped.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm generate-routes && pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0, including both new test files
- [ ] `grep -n "hashedKey" src/lib/export-data.ts` → 0 matches
- [ ] `grep -n "Access-Control" src/routes/api/export.ts` → 0 matches
- [ ] `grep -n "api/export" src/components/AccountClient.tsx` → 1 match
- [ ] Manual check in Step 4 done and reported
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `DangerZone` in `AccountClient.tsx` no longer matches the "Current state"
  location — find where deletion UI lives now and report before placing UI.
- You need to widen any `where` clause beyond the single `userId` equality to
  make a query work — that touches the security boundary; stop.
- The bundle for a realistic seed exceeds a few MB in tests and you're
  tempted to stream — that's the deferred concern; report instead.

## Maintenance notes

- `format: "mend-export/v1"` is the compatibility handle: additive fields are
  free; renames/removals bump it.
- If per-user data grows past what one in-memory JSON.stringify should hold,
  move to a streamed NDJSON response — the route is the only thing that
  changes; `buildExport` splits into per-table generators.
- If plan 027 (shared ingest contract) lands, keep the export's violation
  shape aligned with the stored shape, not the wire shape — they differ
  (grouping, ids) and the export documents storage.
