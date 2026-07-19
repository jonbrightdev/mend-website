# Plan 039: Enforce Free/Pro limits (gated)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a0f7690..HEAD -- src/routes/api/ingest.ts src/lib/account-queries.ts src/lib/rate-limit.ts contract/README.md`
> Confirm 036 landed (`getUserEntitlements`, `seedProSubscription`,
> `PLAN_LIMITS`). Prefer 037/038 before production flag flips, but runtime
> code only **depends on 036**. Compare "Current state" to live code; STOP on
> mismatch.
>
> **Design source of truth**: `plans/pricing-stripe-design.md` §§ Hot path
> ingest, API key quota, Rollout phases C/D.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH if Free flags go true without upgrade UI (do not flip prod)
- **Depends on**: 036 (runtime); prefer after 037/038 for production readiness
- **Category**: billing / enforcement
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

Entitlements are meaningless until ingest rate limits, audit caps, API-key
quotas, and retention purge read them. Free product tightenings must remain
**gated** so `main` deploys do not strand users before Checkout + pricing UI
exist.

Founder-approved limits (when `FREE_LIMITS_ENFORCED=true`):

| | Free | Pro |
|--|------|-----|
| Retention | **30 days** | **2 years** |
| Audit cap (new rows only) | **200** | **50_000** |
| Active API keys | **3** | **20** |
| Ingest rate | **60 / min** | **300 / min** |
| Price | — | **$9/mo · $90/yr** |

When unenforced: Free keeps **legacy** limits (20 keys, unbounded audits, no
purge) via `LEGACY_FREE_LIMITS`. Extension stays free/offline always.

**Phase C flip only after 040 + 041 are live** (and founder sign-off). This unit
implements gated code; it does **not** set production `FREE_LIMITS_ENFORCED=true`.

## Design decisions (already made — do not re-litigate)

- **Dual in-process limiters** (60 free / 300 pro) — same single-node design as
  plan 024; no Redis.
- **Audit cap preserves idempotency**: existence check for
  `(userId, url, scannedAt)` **first** — duplicates return **200** even at
  cap; only **new** rows get **403 `AUDIT_CAP`**.
- **Key quota grandfathering**: block **new** key creation over Free limit; do
  **not** revoke existing extras.
- **Retention purge** only when `RETENTION_PURGE_ENABLED === "true"` and
  effective `auditRetentionDays` is finite; lazy after successful non-duplicate
  ingest, throttled in-process max once / 24h / user.
- Cap error copy uses the founder number **200** for Free. Mention upgrade
  without implying the extension is locked.

## Current state

- `src/routes/api/ingest.ts:33` — single `createRateLimiter({ limit: 60, … })`.
- `src/routes/api/ingest.ts:84-99` — after auth, fixed limiter; no entitlements.
- `src/routes/api/ingest.ts:148-172` — insert + `onConflictDoNothing`; no
  existence-before-cap path; no audit count.
- `src/routes/api/ingest.test.ts` — 60/61 rate-limit test (~line 237).
- `src/lib/account-queries.ts:41-47` — `MAX_ACTIVE_KEYS = 20`, flat
  `assertKeyQuota`.
- `src/lib/account-fns.test.ts` — quota tests assume 20 and “under cap” at 19.
- `contract/README.md` Responses table — 201/200/400/401/413/429/500; **no**
  `403 AUDIT_CAP`.
- After 036: `getUserEntitlements`, `seedProSubscription`, `areFreeLimitsEnforced`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Ingest tests | `pnpm test src/routes/api/ingest.test.ts` | all pass |
| Account tests | `pnpm test src/lib/account-fns.test.ts` | all pass |
| Full suite | `pnpm test` | all pass |
| Full CI | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | all exit 0 |

## Scope

**In scope**:

- `src/routes/api/ingest.ts`
- `src/routes/api/ingest.test.ts`
- `src/lib/account-queries.ts` (`assertKeyQuota` plan-aware)
- `src/lib/account-fns.test.ts` (and/or account-queries tests)
- `src/lib/retention.ts` (new)
- `src/lib/retention.test.ts` (new)
- `contract/README.md` (add `403 AUDIT_CAP` row; note extension shows
  `body.error` verbatim)
- Optionally sync note in `plans/027` maintenance if needed — prefer only
  `contract/README.md` as the living contract
- `plans/README.md` (status row)

**Out of scope**:

- Account UI “N of max keys” / error surfacing — 040 (server throws already).
- Pricing / Checkout / webhooks.
- Setting Railway `FREE_LIMITS_ENFORCED=true` or `RETENTION_PURGE_ENABLED=true`.
- Cron retention for inactive users (future).
- Changing `createRateLimiter` API unless necessary (prefer dual instances).

## Git workflow

- Work on `main`. Commit e.g.
  `Enforce plan-aware ingest, key, and retention limits behind env gates`.
- Do NOT push unless instructed.
- Do **not** enable Free tightenings in production env in this unit.

## STOP conditions

Stop and report if:

- 036 missing (`getUserEntitlements` / schema).
- Ingest handler order no longer matches Current state enough to place
  entitlements after auth and cap after parse.
- You are about to 403 **before** duplicate existence check — redesign; that
  breaks extension retries.
- You are about to revoke grandfathered keys on Free.
- Tempted to set default `FREE_LIMITS_ENFORCED` to true in code.

## Steps

### Step 1: Dual rate limiters on ingest

In `src/routes/api/ingest.ts`, replace the single limiter:

```ts
const freeLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const proLimiter = createRateLimiter({ limit: 300, windowMs: 60_000 });

function checkIngestRate(userId: string, plan: "free" | "pro") {
  return (plan === "pro" ? proLimiter : freeLimiter).check(userId);
}
```

After `resolveUser` succeeds:

```ts
const entitlements = await getUserEntitlements(userId);
const verdict = checkIngestRate(userId, entitlements.plan);
// 429 path unchanged (CORS + Retry-After); optional message can mention Pro later
```

Mid-window Free→Pro upgrade grants a **fresh** Pro window (acceptable).

### Step 2: Audit cap with idempotency-first algorithm

After `parsePayload`, **before** insert (or at the start of the write path):

```
// 1) Existence for this exact run (same unique key as audit_user_url_scanned)
const existing = SELECT 1 FROM audit WHERE userId=? AND url=? AND scannedAt=? LIMIT 1
if (existing) → 200 { duplicate: true }  // NO cap check

// 2) Cap only for would-be NEW rows
if (Number.isFinite(entitlements.maxStoredAudits)) {
  const count = SELECT count(*) FROM audit WHERE userId=?
  if (count >= maxStoredAudits) → 403 {
    error: "Free accounts can store up to 200 saved audits. Delete old audits or upgrade to Pro on the Pricing page.",
    // (use Pro-appropriate copy when entitlements.plan === "pro")
    code: "AUDIT_CAP",
  } + CORS via json()
}

// 3) INSERT … ON CONFLICT DO NOTHING (belt-and-suspenders)
```

Pro at 50_000 uses the same rule. When `maxStoredAudits` is `Infinity` (legacy
free), skip the count check.

Preserve CORS on 403 via existing `json()` helper.

### Step 3: Gated retention purge

New `src/lib/retention.ts`:

- `maybePurgeOldAudits(userId, retentionDays)` runs only if
  `process.env.RETENTION_PURGE_ENABLED === "true"` and `Number.isFinite(retentionDays)`.
- Deletes audits with `scannedAt` older than `now - retentionDays` for that user
  (cascade violations via FK).
- In-process `lastPurgeByUser` Map: at most once per 24h per userId.
- Optional: if `RETENTION_PURGE_DRY_RUN=true`, log `wouldDelete=N` and skip DELETE.
- Call from ingest **after successful non-duplicate** write (201 path), not on
  duplicates or 403s.

Unit tests with fake clock / seeded audits; env restored after tests.

Document limitation: users who never ingest again never trigger lazy purge
(cron is future work).

### Step 4: Plan-aware `assertKeyQuota`

In `src/lib/account-queries.ts`:

```ts
export async function assertKeyQuota(userId: string): Promise<void> {
  const { maxActiveApiKeys } = await getUserEntitlements(userId);
  const active = (await listKeysFor(userId)).filter((k) => !k.revokedAt);
  if (active.length >= maxActiveApiKeys) {
    throw new Error(
      maxActiveApiKeys <= PLAN_LIMITS.free.maxActiveApiKeys
        ? "Free accounts can have 3 active keys. Revoke one or upgrade to Pro."
        : "Key limit reached. Revoke an unused key first.",
    );
  }
}
```

- Import `getUserEntitlements` and `PLAN_LIMITS`.
- Keep exporting a constant for tests if useful, but the sole authority for
  limits is entitlements (`MAX_ACTIVE_KEYS = 20` may become Pro max re-export
  from `PLAN_LIMITS.pro.maxActiveApiKeys` or remain as documentation — update
  tests accordingly).
- **Do not** delete or revoke keys over the Free limit.

Update `account-fns.test.ts`:

1. Unenforced free → still allow up to 20 (legacy).
2. Enforced free → refuse at 3; message mentions Free / Pro.
3. After `seedProSubscription` → allow up to 20; refuse at 20 with Pro message.
4. Grandfather scenario: seed 5 active keys + enforced free →
   `assertKeyQuota` rejects **new** creates (5 >= 3) but the existing keys
   are untouched. Expect throw; do not auto-revoke.

### Step 5: Update ingest tests

In `src/routes/api/ingest.test.ts`:

1. Keep/adjust **60/61 free** path (default unenforced free still 60 rpm).
2. **Pro path**: `seedProSubscription(userId)`; allow 300, deny 301 (or sample
   at 300/301 with unique user).
3. **Cap cases** with `FREE_LIMITS_ENFORCED=true`:
   - Seed 200 audits; new distinct `(url, scannedAt)` → **403** + `code: "AUDIT_CAP"`.
   - At cap, re-POST **same** run → **200** `{ duplicate: true }`.
4. Unenforced free with many audits → no 403.
5. Existing CORS / 429 / 500 tests must still pass.

Use distinct userIds so shared limiter state does not cross-contaminate.

### Step 6: Contract docs

In `contract/README.md` Responses table, add:

| `403` | `{ error, code: "AUDIT_CAP" }` | new run would exceed plan `maxStoredAudits`; **not** returned for duplicate `(user, url, startedAt)` |

Note rate limit may be 60 or 300 by plan (optional clarification on the 429
row). Extension shows `error` verbatim — keep Free copy user-readable.

Bump `CONTRACT_VERSION` only if required by the contract protocol for response
additions; a new status code is a wire-visible change — if the protocol says
bump on previously-accepted shape changes, bump; otherwise document the new
row without bump (follow the file's "Update protocol" section literally).

### Step 7: Full CI

`pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Test plan

Steps 3–5. No production flag flip. Optional local: set
`FREE_LIMITS_ENFORCED=true` against PGlite and hit ingest with curl + API key.

## Done criteria

- [ ] Dual limiters 60 / 300 wired via `getUserEntitlements`
- [ ] Existence check before cap; duplicate-at-cap → 200; new-at-cap → 403 AUDIT_CAP
- [ ] `assertKeyQuota` plan-aware; grandfather extras not revoked
- [ ] `retention.ts` no-ops unless `RETENTION_PURGE_ENABLED=true`
- [ ] Default still unenforced free (legacy limits) when env unset/false
- [ ] `contract/README.md` documents 403 AUDIT_CAP
- [ ] ingest + account tests updated and green
- [ ] `pnpm typecheck` / `lint` / `test` / `build` green
- [ ] No production env commit enabling Free flags
- [ ] No files outside scope
- [ ] `plans/README.md` status row for 039 → DONE

## Maintenance notes

- **Phase C**: set Railway `FREE_LIMITS_ENFORCED=true` only after 040+041 live.
- **Phase D**: `RETENTION_PURGE_ENABLED=true` after banners/pricing copy; dry-run
  first if desired.
- Multi-node: dual Map limiters need Redis (same as plan 024 maintenance).
- Design reference: `plans/pricing-stripe-design.md` §§ Hot path, API key quota,
  Rollout.

When done, update `plans/README.md` status row to DONE.
