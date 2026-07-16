# Plan 011: Cap ingest payload size, field lengths, timestamps, and keys per user

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat dbd4669..HEAD -- src/routes/api/ingest.ts src/lib/ingest-payload.ts src/lib/account-fns.ts`
> Plans 009 (extraction of parsing into `src/lib/ingest-payload.ts`) and 010
> (transaction in the route) are expected predecessors — their changes are
> fine. Any *other* drift from the "Current state" excerpts is a STOP
> condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/009-test-and-ci-baseline.md, plans/010-transactional-ingest.md (same file; land 010 first)
- **Category**: security
- **Planned at**: commit `dbd4669`, 2026-07-16

## Why this matters

`POST /api/ingest` is an internet-facing endpoint (CORS `*`, bearer-key auth)
that writes client-supplied data straight to Postgres with **no size limits of
any kind**: the JSON body is unbounded, `issues[]` can hold any number of
entries, every string field (including raw page-HTML snippets) is unbounded,
and `startedAt` accepts any epoch value — a timestamp years in the future
corrupts the dashboard's "last scanned"/trend ordering. Separately, a signed-in
user can mint unlimited API keys. Any single leaked or malicious key can
exhaust storage. This plan adds conservative caps that no legitimate extension
payload will hit.

## Current state

- `src/lib/ingest-payload.ts` (after plan 009; originally
  `src/routes/api/ingest.ts:109-152` at `dbd4669`) — `parsePayload` validates
  types but not sizes. Relevant excerpt as written at `dbd4669`:

  ```ts
  const url = str(b.url, "url");
  if (!/^https?:\/\//.test(url)) bad("url must be an http(s) URL");

  if (typeof b.startedAt !== "number" || !Number.isFinite(b.startedAt)) {
    bad("startedAt must be an epoch-ms number");
  }
  const scannedAt = new Date(b.startedAt);
  if (Number.isNaN(scannedAt.getTime())) bad("startedAt is not a valid time");

  if (!Array.isArray(b.issues)) bad("issues must be an array");
  ```

  Each issue is built with `str(...)` fields: `ruleId`, `impact`, `category`,
  `title`, `description`, `helpUrl`, `selector`, `html`, `failureSummary`,
  plus a `wcag: string[]` filter and numeric `domOrder`.
- `src/routes/api/ingest.ts` — POST handler reads the body with
  `await request.json()` (unbounded) before parsing.
- `src/lib/account-fns.ts:47-64` — `createApiKey` server function inserts a new
  key with no per-user cap:

  ```ts
  export const createApiKey = createServerFn({ method: "POST" })
    .validator((name: unknown): string => {
      const trimmed = typeof name === "string" ? name.trim() : "";
      return (trimmed || "Chrome extension").slice(0, 80);
    })
    .handler(async ({ data: name }) => {
      const user = await currentSessionUser();
      if (!user) throw redirect({ to: "/login" });
      const key = generateKey();
      await db.insert(apiKey).values({ ... });
      return { key, keys: await listKeysFor(user.id) };
    });
  ```

- `src/components/AccountClient.tsx:20-33` — `onGenerate` catches any failure
  and shows a generic "Couldn't create a key. Please try again." No UI change
  needed for the cap; the generic error is acceptable (see maintenance notes).
- Error convention in the parser: `bad("message")` throws `IngestError`, which
  the route maps to a 400 JSON response.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Install   | `pnpm install`   | exit 0              |
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/ingest-payload.ts` (or `src/routes/api/ingest.ts` if plan 009 has
  not landed — see STOP conditions)
- `src/routes/api/ingest.ts` (body-size gate)
- `src/lib/account-fns.ts` (key cap)
- `src/lib/ingest-payload.test.ts`, `src/lib/account-fns` coverage via
  `src/routes/api/ingest.test.ts` or a new `src/lib/account-fns.test.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- Rate limiting (requests/minute). It needs an infra decision (memory vs
  Redis vs proxy) — record it as deferred; do not improvise an in-memory
  limiter.
- The extension repo (`../mend-a11y`) — even if its payloads would exceed a
  cap, do not edit it; that's a STOP condition instead.
- CORS headers and auth logic in the route.

## Git workflow

- Branch: `advisor/011-ingest-abuse-limits`
- Commit style: short imperative sentence, e.g. "Cap ingest payload sizes and API keys per user".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Body-size gate in the route

In `src/routes/api/ingest.ts` POST handler, replace `await request.json()`
with a text read + explicit cap (1 MiB):

```ts
const MAX_BODY_BYTES = 1_000_000;
// ...
const text = await request.text();
if (text.length > MAX_BODY_BYTES) {
  return json({ error: "Payload too large" }, 413);
}
let body: unknown;
try {
  body = JSON.parse(text);
} catch {
  return json({ error: "Body must be JSON" }, 400);
}
```

Place `MAX_BODY_BYTES` with the other module constants. Keep the existing 400
response text for non-JSON unchanged.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Field and count caps in `parsePayload`

Add a `LIMITS` constant and enforce, using the existing `bad()` convention for
things that indicate a broken/malicious client, and **truncation** for
oversized content strings (real pages can legitimately contain huge elements —
losing snippet tail is better than dropping the audit):

```ts
const LIMITS = {
  url: 2_000,          // reject over: bad("url is too long")
  pageTitle: 500,      // truncate
  issues: 1_000,       // reject over: bad("too many issues (max 1000)")
  ruleId: 200,         // reject over
  category: 200,       // truncate
  title: 500,          // truncate
  description: 2_000,  // truncate
  helpUrl: 2_000,      // drop (set undefined) when over
  selector: 2_000,     // truncate
  html: 5_000,         // truncate
  failureSummary: 5_000, // truncate
  wcagEntries: 25,     // keep first 25
  wcagLength: 200,     // filter out longer entries
} as const;
```

Implement with a small helper (e.g. `clip(s: string, max: number)`) so each
field is one call — match the terse style of the existing `str` helper.
Reject vs truncate per the comments above: `url`, `issues` count, and `ruleId`
are load-bearing identifiers (reject); everything else is display content
(truncate/drop).

Timestamp sanity, after the existing validity check:

```ts
// Reject timestamps that would corrupt dashboard ordering: more than one day
// in the future, or before the extension existed.
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
if (b.startedAt > Date.now() + MAX_FUTURE_MS) bad("startedAt is in the future");
if (b.startedAt < Date.UTC(2020, 0, 1)) bad("startedAt is unreasonably old");
```

Also clamp the numeric extras where they're read: `durationMs` and
`totalChecks` — keep only finite values in `[0, 1e9]`, else `undefined`;
`domOrder` — keep only finite values in `[0, 1e6]`, else the array index.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Cap active API keys per user

In `src/lib/account-fns.ts` `createApiKey` handler, before inserting, count the
user's **active** (non-revoked) keys and refuse over a cap of 20:

```ts
const active = (await listKeysFor(user.id)).filter((k) => !k.revokedAt);
if (active.length >= 20) {
  throw new Error("Key limit reached. Revoke an unused key first.");
}
```

(Reuse `listKeysFor` — it already exists in this file; don't add a count
query.) The client's generic error message covers this; no UI change.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Tests

Extend `src/lib/ingest-payload.test.ts` (from plan 009):

- Body over 1 MiB → this is route-level; test in
  `src/routes/api/ingest.test.ts` only if the handler is directly invokable
  there (see plan 010's note); otherwise assert the constant exists via the
  parser tests below and note the gap.
- `issues` array of 1001 minimal valid issues → throws `IngestError`.
- `url` of 2001 chars → throws. `ruleId` of 201 chars → throws.
- `html` of 10 000 chars → parsed, `issue.html.length === 5000`.
- `helpUrl` of 5 000 chars → parsed, `helpUrl === undefined`.
- `startedAt = Date.now() + 2 * 86400_000` → throws "future".
- `startedAt = Date.UTC(2019, 0, 1)` → throws "old".
- `wcag` with 30 entries → first 25 kept.
- Regression: a normal, well-formed payload (the plan-009 happy-path fixture)
  still parses identically.

For the key cap, add a DB-backed test (plan-009 harness): seed a user, insert
20 active `apiKey` rows directly via the schema, then assert the *guard logic*
refuses — if the `createServerFn` wrapper can't be invoked in plain Vitest,
extract the countable check into a small exported helper
(`assertKeyQuota(userId)`) in `account-fns.ts` and test that instead.

**Verify**: `pnpm test` → all pass.

## Test plan

See step 4; model on the plan-009 test files. Every new limit must have at
least one over-limit test and the happy-path regression must stay green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with ≥ 8 new limit tests passing
- [ ] `grep -n "MAX_BODY_BYTES" src/routes/api/ingest.ts` → 1 definition, used in the handler
- [ ] `grep -n "LIMITS" src/lib/ingest-payload.ts` → present (or in `ingest.ts` if 009 hasn't landed)
- [ ] `grep -n "20" src/lib/account-fns.ts` shows the key cap in `createApiKey`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 009 has not landed AND the parsing code is no longer at
  `src/routes/api/ingest.ts:109-152` as excerpted — you can't locate
  `parsePayload` confidently.
- You find evidence (comments, the `../mend-a11y` types file referenced at the
  top of `ingest.ts`) that the extension legitimately sends payloads exceeding
  a proposed cap — report which cap conflicts instead of silently raising it.
- The `createServerFn` validator/handler API doesn't match the excerpt
  (TanStack Start version drift).

## Maintenance notes

- Caps are deliberately generous (10× typical axe output). If the extension
  later batches multiple pages per request, `issues` and body caps must be
  revisited **together with** the extension's chunking.
- Rate limiting is explicitly deferred: revisit when the deployment target is
  known (single node → in-process limiter is fine; serverless → needs shared
  store).
- Reviewer: check truncation vs rejection choices — identifiers reject,
  content truncates; a mixed-up choice silently drops audits.
- Follow-up (out of scope here): the AccountClient generic error could
  distinguish the quota case; only worth it if users actually hit the cap.
