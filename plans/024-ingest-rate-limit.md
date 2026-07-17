# Plan 024: Rate-limit /api/ingest per user with an in-process limiter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb1bec2..HEAD -- src/routes/api/ingest.ts src/lib/ingest-payload.ts`
> If `src/routes/api/ingest.ts` changed since this plan was written, compare
> the "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (a wrong limit blocks legitimate syncs)
- **Depends on**: none
- **Category**: security / abuse
- **Planned at**: commit `cb1bec2`, 2026-07-17

## Why this matters

Plan 011 capped the *size* of any one ingest request (1 MB body, 1 000
issues, per-field clips) but deliberately deferred *frequency*: a valid API
key can still write audits in a tight loop and grow the `audit`/`violation`
tables without bound. This was the one acknowledged gap left by the security
generation ("Direction ideas" in `plans/README.md`).

The deferred infra decision is now resolvable: the app deploys as a **single
Railway service** (`railway.json`, one Node process), so an in-process
limiter is correct. No Redis, no new dependency. The trade-offs of that choice
are documented in "Maintenance notes" so a future multi-node move knows to
revisit.

## Design decisions (already made — do not re-litigate)

- **Keyed by userId, applied after auth.** The limit protects the database
  write path. Unauthenticated requests are not limited here: an invalid key
  costs one SHA-256 and one indexed SELECT, and the key space (32-byte
  CSPRNG) makes brute force irrelevant. Per-IP limiting would require
  trusting `X-Forwarded-For` through Railway's proxy — out of scope.
- **Fixed window, 60 requests per 60 s per user.** The extension uploads one
  audit per explicit user click ("Save"); 60/min is an order of magnitude
  above any human rate while still capping a runaway script at ~86 k
  rows/day instead of millions. Fixed-window's burst-at-boundary weakness
  (up to 2× limit across a boundary) is acceptable at this generosity.
- **429 + `Retry-After`**, JSON error body, CORS headers included — the
  extension's `uploadAudit` (`../mend-a11y/src/lib/sync.ts:110-118`) surfaces
  `body.error` verbatim in the panel, so the message must be user-readable.
- **Counters reset on process restart.** Fine: the limiter is an abuse
  backstop, not billing.

## Current state

- `src/routes/api/ingest.ts:81-96` — the POST handler runs, in order:
  `resolveUserId(request)` (bearer key, then session cookie) → 401 if null;
  body read + `MAX_BODY_BYTES` check → 413; JSON parse → 400; `parsePayload`
  → 400; then the insert transaction. All responses go through
  `json(data, status)` which attaches `CORS_HEADERS`.
- `src/lib/ingest-payload.ts` — pure parsing, no limiter concerns; not
  touched by this plan.
- There is no rate limiting anywhere in the repo, and no shared-store
  dependency to reuse.
- Test pattern: `src/routes/api/ingest.test.ts` boots `createTestDb()`, then
  dynamically imports the route and drives the exported handler with `Request`
  objects (bearer-key auth path).

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/rate-limit.ts` (new — pure, no imports from the app)
- `src/lib/rate-limit.test.ts` (new)
- `src/routes/api/ingest.ts` (wire the limiter in)
- `src/routes/api/ingest.test.ts` (add the 429 case)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/lib/ingest-payload.ts` — size caps are plan 011's, already done.
- Any other route or server function — only ingest gets a limiter.
- New dependencies — the limiter is a Map and some arithmetic.
- Per-IP limiting, proxy header parsing.

## Git workflow

Work directly on `main` (per CLAUDE.md). Commit style: short imperative
sentence, e.g. "Rate-limit ingest to 60 requests per user per minute". Run
the full CI check list before pushing.

## Steps

### Step 1: The pure limiter

New file `src/lib/rate-limit.ts`, in the house style of
`ingest-payload.ts` (banner comment, no app imports):

```ts
export interface RateLimiter {
  /** Records a hit for `key`; returns whether it is allowed and, when
      denied, whole seconds until the window resets. */
  check(key: string): { ok: true } | { ok: false; retryAfterSeconds: number };
}

export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: () => number; // injectable clock for tests; defaults to Date.now
}): RateLimiter
```

Implementation: a `Map<string, { windowStart: number; count: number }>`.
On `check`: compute the current window from `now()`; if the entry's window is
stale, reset it. Increment, compare to `limit`. **Prune**: when the map
exceeds ~10 000 entries, delete stale ones during a check, so memory stays
bounded regardless of key cardinality.

Unit tests (`src/lib/rate-limit.test.ts`) with a fake clock:
1. Allows `limit` hits in one window, denies the next.
2. `retryAfterSeconds` is positive and ≤ window length, and rounds up (never
   0 while denied).
3. A new window resets the count.
4. Keys are independent.
5. Stale entries get pruned (drive the map past the prune threshold with the
   clock advanced).

**Verify**: `pnpm test` → new file passes.

### Step 2: Wire it into the route

In `src/routes/api/ingest.ts`:

1. Module-level instance:
   ```ts
   // Single-node deploy (railway.json runs one process), so an in-process
   // limiter is sufficient. Revisit if this ever runs on more than one node.
   const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
   ```
2. In the POST handler, immediately after the `userId` null-check:
   ```ts
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
   ```
   (Placed after auth so unauthenticated noise can't consume a user's quota,
   and before the body read so limited requests stay cheap.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Route test

In `src/routes/api/ingest.test.ts`, add a describe block: with a seeded
user + key, POST the same minimal payload (0 issues) 61 times. Expect the
first 60 responses to be < 429 (201 then 200-duplicates) and the 61st to be
429 with a `Retry-After` header and an `error` string. Use a distinct
user/key from the other tests so their request counts don't interfere —
the limiter is module state shared across the file.

**Verify**: `pnpm test` → all pass, including existing ingest tests (they
make far fewer than 60 requests per user, so they must not start flaking; if
they do, their users are colliding — fix the test, not the limit).

## Test plan

Steps 1 and 3. No manual step required: the extension path is already
covered by the route tests' bearer-key requests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0, including `rate-limit.test.ts` and the new 429 case
- [ ] `grep -n "429" src/routes/api/ingest.ts` → ≥ 1 match with `Retry-After`
- [ ] `grep -rn "createRateLimiter" src/lib/rate-limit.ts src/routes/api/ingest.ts` → definition + one call site, nowhere else
- [ ] No new entries in `package.json` dependencies (`git diff package.json` empty)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The POST handler in `src/routes/api/ingest.ts` no longer matches the
  "Current state" ordering (auth → size → parse → transaction).
- You are tempted to add a dependency (rate-limiter package, Redis client) —
  the single-node decision says no.
- Deployment has changed from a single Railway service (check
  `railway.json`): multi-node invalidates the in-process design; the plan
  must be re-cut around a shared store instead.
- Existing ingest tests start failing because of shared limiter state and the
  fix would mean exporting a "reset" hook used in production code paths —
  report; prefer per-test unique users.

## Maintenance notes

- If the extension ever gains scheduled/automatic syncing, 60/min per user
  may need raising — the constant sits in one place in the route.
- On a move to multiple nodes or serverless, replace the Map with a shared
  store (the `RateLimiter` interface is the seam; only `createRateLimiter`'s
  internals change).
- The privacy/abuse story now has three layers: per-request caps (011),
  per-user frequency (this plan), and per-user key quota
  (`MAX_ACTIVE_KEYS`, plan 014 hardening). Keep them consistent when
  changing any one.
