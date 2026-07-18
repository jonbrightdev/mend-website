# Plan 030: Reject oversized ingest bodies early and stop paying a DB write per rate-limited request

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0be29dc..HEAD -- src/routes/api/ingest.ts src/routes/api/ingest.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding. Plan 029
> adds a try/catch *below* the lines this plan edits — that specific diff is
> expected and fine; any other mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/029-ingest-500-cors.md (same file; execute 029 first)
- **Category**: security
- **Planned at**: commit `0be29dc`, 2026-07-18

## Why this matters

Two related inefficiencies in `POST /api/ingest`, both cheap to fix:

1. **The body is fully buffered before the size check.** `await request.text()`
   reads however much the client sends into memory; the 1,000,000-UTF-16-unit
   cap is only checked afterwards, and the `Content-Length` header is never
   consulted. An authenticated caller can ship far-oversized bodies (60/min
   under the rate limit) that are each fully materialized on the single
   Railway node before being rejected. Checking `Content-Length` first turns
   that into a header-only rejection.
2. **`lastUsedAt` is written before the rate limit is checked.** Auth
   resolution both SELECTs the key row and UPDATEs `lastUsedAt`; the limiter
   runs afterwards. So a client hammering past the limit still costs one
   SELECT **and one UPDATE** per request, forever. Deferring the touch until
   after the limiter halves the DB cost of abuse to a single indexed SELECT.

## Current state

Relevant files:

- `src/routes/api/ingest.ts` — the ingest route.
- `src/routes/api/ingest.test.ts` — write-path tests (in-memory DB harness).

`src/routes/api/ingest.ts:26-33` today:

```ts
// Roughly 1 MiB, measured in UTF-16 units rather than bytes — close enough for
// a backstop that no real payload approaches. The extension's largest plausible
// run (1000 issues, html clipped to 500 chars) is an order of magnitude under.
const MAX_BODY_BYTES = 1_000_000;

// Single-node deploy (railway.json runs one process), so an in-process
// limiter is sufficient. Revisit if this ever runs on more than one node.
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
```

`src/routes/api/ingest.ts:56-80` today — auth resolution, including the eager
touch:

```ts
// Resolves the acting user: a valid, non-revoked API key wins; otherwise the
// session cookie. Returns null when neither identifies a user.
async function resolveUserId(request: Request): Promise<string | null> {
  const token = bearerToken(request);
  if (token) {
    const hashed = await hashKey(token);
    const [row] = await db
      .select({ id: apiKey.id, userId: apiKey.userId, revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(eq(apiKey.hashedKey, hashed))
      .limit(1);
    if (!row || row.revokedAt) return null;
    // Touch lastUsedAt so the account page can show the key is live. Must be
    // awaited: Drizzle query builders are lazy and only run when awaited, so a
    // fire-and-forget `void db.update(...)` would never actually execute.
    await db
      .update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKey.id, row.id));
    return row.userId;
  }

  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}
```

`src/routes/api/ingest.ts:86-106` today — the POST handler head:

```ts
      POST: async ({ request }) => {
        const userId = await resolveUserId(request);
        if (!userId) {
          return json({ error: "Unauthorized" }, 401);
        }

        const verdict = limiter.check(userId);
        if (!verdict.ok) {
          return Response.json(
            { error: "Rate limit exceeded — try again in a minute." },
            {
              status: 429,
              headers: { ...CORS_HEADERS, "Retry-After": String(verdict.retryAfterSeconds) },
            },
          );
        }

        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) {
          return json({ error: "Payload too large" }, 413);
        }
```

The wire contract (`contract/README.md`) says: "Body must be ≤ 1,000,000
UTF-16 units" and 413 responds when "body exceeds 1,000,000 UTF-16 units".

**Encoding fact the early gate relies on** (inline it as a comment): one UTF-16
code unit encodes to at most 3 UTF-8 bytes (BMP characters are 1–3 bytes for
1 unit; astral characters are 4 bytes for 2 units). So a payload within the
1,000,000-unit cap can never exceed 3,000,000 bytes — rejecting on
`Content-Length > 3,000,000` can never reject a contract-compliant payload.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                          | exit 0              |
| One suite | `pnpm test src/routes/api/ingest.test.ts` | all pass            |
| All tests | `pnpm test`                               | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/routes/api/ingest.ts`
- `src/routes/api/ingest.test.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/rate-limit.ts` — the limiter is correct; only its call site moves.
- `contract/README.md` — the observable contract is unchanged (same 413, same
  cap; the byte gate is strictly a fast path that compliant payloads never hit).
- `src/lib/api-key.ts`, `src/lib/ingest-payload.ts`.

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Commit message style: single imperative sentence, e.g.
  `Gate ingest on Content-Length and touch lastUsedAt after the rate limit`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Split identity resolution from the lastUsedAt touch

In `src/routes/api/ingest.ts`, change `resolveUserId` so it no longer writes.
Return the key id alongside the user id so the handler can touch later:

```ts
// Resolves the acting user: a valid, non-revoked API key wins; otherwise the
// session cookie. Returns the key row id for key-based auth so the caller can
// touch lastUsedAt — deliberately *after* the rate-limit check, so hammering
// past the limit costs one indexed SELECT, not a write, per request.
async function resolveUser(
  request: Request,
): Promise<{ userId: string; apiKeyId: string | null } | null> {
  const token = bearerToken(request);
  if (token) {
    const hashed = await hashKey(token);
    const [row] = await db
      .select({ id: apiKey.id, userId: apiKey.userId, revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(eq(apiKey.hashedKey, hashed))
      .limit(1);
    if (!row || row.revokedAt) return null;
    return { userId: row.userId, apiKeyId: row.id };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  return session ? { userId: session.user.id, apiKeyId: null } : null;
}
```

In the POST handler, adapt: resolve → 401 on null → `limiter.check(userId)` →
429 → then, only on the allowed path, perform the touch (keep the original
"must be awaited" comment with it):

```ts
        const who = await resolveUser(request);
        if (!who) {
          return json({ error: "Unauthorized" }, 401);
        }
        const { userId, apiKeyId } = who;

        const verdict = limiter.check(userId);
        if (!verdict.ok) { ...unchanged 429... }

        if (apiKeyId) {
          // Touch lastUsedAt so the account page can show the key is live.
          // Must be awaited: Drizzle query builders are lazy and only run when
          // awaited, so a fire-and-forget void would never execute.
          await db
            .update(apiKey)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKey.id, apiKeyId));
        }
```

**Verify**: `pnpm typecheck` → exit 0, then
`pnpm test src/routes/api/ingest.test.ts` → all existing tests still pass
(there is an existing test asserting `lastUsedAt` is recorded on ingest — it
must stay green).

### Step 2: Add the Content-Length fast-path rejection

Directly after the rate-limit block (before `await request.text()`):

```ts
// One UTF-16 unit is at most 3 UTF-8 bytes, so a contract-compliant body
// (≤ MAX_BODY_BYTES UTF-16 units) can never exceed 3× that in bytes. Reject
// on the header before buffering; the post-read check below stays
// authoritative for chunked bodies that carry no Content-Length.
const contentLength = Number(request.headers.get("content-length"));
if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES * 3) {
  return json({ error: "Payload too large" }, 413);
}
```

Keep the existing post-read `text.length > MAX_BODY_BYTES` check unchanged —
it remains the authoritative, contract-exact check.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Tests

In `src/routes/api/ingest.test.ts` add:

1. **Header gate**: a request whose `content-length` header exceeds 3,000,000 →
   413, body `{ error: "Payload too large" }`. Node's `Request` normally
   computes `content-length` from the body; if constructing one with a forged
   header proves unreliable in undici, call the handler with a minimal stub
   instead — the handler only uses `request.headers`, `request.text()`, and
   auth inputs, and existing tests show how requests are built. A plain
   `new Request(url, { method: "POST", headers: { authorization, "content-length": "3000001" }, body: "{}" })`
   attempt comes first; fall back to the stub only if the header is not
   preserved (assert `req.headers.get("content-length")` before relying on it).
2. **Ordering**: past the rate limit, `lastUsedAt` is not written. Use a
   **fresh user and key created only for this test** (the limiter is
   module-scoped and persists across tests in the file — do not burn the
   shared test user's budget). Send 61 requests with valid small payloads
   (vary `startedAt` per request to avoid the idempotency conflict), assert
   request 61 returns 429, then read the key row and assert `lastUsedAt`
   equals the value it had after request 60 (capture it before request 61) —
   i.e. the 429 did not touch it.

**Verify**: `pnpm test src/routes/api/ingest.test.ts` → all pass including the
new tests, then `pnpm test` → full suite green.

## Test plan

Covered in Step 3. Existing coverage that must not regress: the
`lastUsedAt`-recorded-on-successful-ingest test, the 413-on-oversized-text
test (if present), 401 paths, duplicate path.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0, including the two new tests
- [ ] `grep -n "content-length" src/routes/api/ingest.ts` → 1 match in the handler
- [ ] In `src/routes/api/ingest.ts`, the `lastUsedAt` update appears *after*
      the `limiter.check` call (confirm by reading the handler top-to-bottom)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (beyond plan 029's try/catch around the transaction).
- The forged `content-length` header is not preserved by `Request` **and** the
  stub approach would require changing the handler's signature — report
  instead of restructuring the route.
- The 61-request ordering test takes pathologically long (> 30 s) — report;
  do not weaken it to fewer requests against a lowered limit by editing the
  route's limiter constants.

## Maintenance notes

- The `* 3` in the header gate is derived from UTF-8/UTF-16 encoding bounds,
  not tuning. If `MAX_BODY_BYTES` ever changes, the gate scales with it
  automatically; do not replace the expression with a literal.
- Bodies sent with chunked encoding (no Content-Length) still buffer fully
  before the authoritative check — accepted residual risk on a single-node
  deploy behind authenticated, rate-limited access. A streaming reader cap was
  considered and deliberately not taken (complexity disproportionate to the
  exposure).
- If the deploy ever goes multi-node, the in-process limiter comment at the
  top of the route already flags what must change; this plan doesn't alter
  that calculus.
