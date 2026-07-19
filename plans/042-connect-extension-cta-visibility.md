# Plan 042: Hide the dashboard "Connect extension" CTA once a key exists

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a0f7690..HEAD -- src/components/DashboardClient.tsx src/lib/dashboard-fns.ts src/lib/account-queries.ts src/routes/dashboard.tsx`
> The working tree at plan time carried unrelated uncommitted OAuth work
> (`LoginForm`, `SignupForm`, `auth-client.ts`, `auth.ts`,
> `audits/$auditId/index.tsx`) — none of it touches these files. Plan 034
> extracts `TrendChart` out of `DashboardClient.tsx`; that coexists fine.
> If the "Current state" excerpts below no longer match, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: user-requested fix
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

The dashboard's app-head renders a ghost-button "Connect extension" link to
`/account` unconditionally (`DashboardClient.tsx:326-328`). For a user who has
already generated a key and connected the extension — which is *every* user
who can see a non-empty dashboard, since audits only arrive through a key or a
session — it is a dead CTA occupying the most prominent slot on the page. It
should render only when the user has **no active API key** (revoked-only
counts as "no key": a fully-revoked account is disconnected again).

## Current state

- `src/routes/dashboard.tsx` — loader calls `fetchDashboard()`; component
  reads `{ user, audits, runDates }` and passes `audits`/`runDates` to
  `DashboardClient`.
- `src/lib/dashboard-fns.ts` — `fetchDashboard` (lines 12-19): session check,
  then `getDashboardData(user.id)`, returns `{ user, audits, runDates }`.
- `src/lib/account-queries.ts` — server-only key queries. `listKeysFor`
  returns all keys with `revokedAt`; `assertKeyQuota` already computes
  "active" as `!k.revokedAt`. This file is where the new query belongs (it
  owns the `apiKey` table access; the dashboard-queries file owns
  audit/violation only).
- `src/components/DashboardClient.tsx:326-328`:

```tsx
        <Link className="btn btn--ghost" to="/account">
          Connect extension
        </Link>
```

- `src/components/DashboardClient.test.tsx` — plan 033's jsdom component
  tests; renders `DashboardClient` with fixture props. Any new required prop
  breaks these until updated.

Note the `EmptyState` (no audits at all) also links to `/account` — that copy
is the onboarding path and stays as-is regardless of key state. Only the
app-head ghost button is conditional.

## Commands you will need

| Purpose   | Command                                          | Expected |
|-----------|--------------------------------------------------|----------|
| Typecheck | `pnpm typecheck`                                 | exit 0   |
| Tests     | `pnpm test`                                      | all pass |
| One suite | `pnpm test src/components/DashboardClient.test.tsx` | all pass |
| Lint      | `pnpm lint`                                      | exit 0   |
| Build     | `pnpm build`                                     | exit 0   |

## Scope

**In scope**:
- `src/lib/account-queries.ts` (add `hasActiveKey`)
- `src/lib/dashboard-fns.ts` (return `hasActiveKey` from `fetchDashboard`)
- `src/routes/dashboard.tsx` (thread the prop)
- `src/components/DashboardClient.tsx` (conditional render)
- `src/components/DashboardClient.test.tsx` (update fixtures + new cases)
- `src/lib/account-queries` tests — extend wherever `listKeysFor` is already
  tested (`grep -rn "listKeysFor" src/lib/*.test.ts` to find the file)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `EmptyState` and its `/account` CTA
- `AccountClient.tsx` — its "Connect extension" *panel* is the key-management
  UI itself, not a CTA
- Any styling

## Git workflow

Work directly on `main`; single imperative commit, e.g.
`Hide the dashboard connect-extension CTA once an active key exists`.
Do NOT push unless the operator instructed it.

## Steps

### Step 1: `hasActiveKey` query

In `src/lib/account-queries.ts` add:

```ts
// Whether the user has at least one non-revoked key — the dashboard uses this
// to decide if the "Connect extension" CTA still earns its slot.
export async function hasActiveKey(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(and(eq(apiKey.userId, userId), isNull(apiKey.revokedAt)))
    .limit(1);
  return rows.length > 0;
}
```

(`isNull` comes from `drizzle-orm`, already the import style of this file.)

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Thread through `fetchDashboard`

In `dashboard-fns.ts`, run it in parallel with the existing query:

```ts
const [{ audits, runDates }, connected] = await Promise.all([
  getDashboardData(user.id),
  hasActiveKey(user.id),
]);
return { user, audits, runDates, hasActiveKey: connected };
```

In `src/routes/dashboard.tsx`, pass `hasActiveKey` to `DashboardClient`.

### Step 3: Conditional render

In `DashboardClient.tsx`: add `hasActiveKey: boolean` to `Props`, and wrap the
ghost button:

```tsx
        {!hasActiveKey && (
          <Link className="btn btn--ghost" to="/account">
            Connect extension
          </Link>
        )}
```

**Verify**: `pnpm typecheck` → exit 0 (the test file will fail typecheck if
fixtures lack the new prop — fix in Step 4).

### Step 4: Tests

1. `DashboardClient.test.tsx`: add `hasActiveKey` to the fixture props
   (existing cases: pass `true` — they assert other behavior and should not
   also see the CTA). New cases:
   - `hasActiveKey: false`, non-empty audits → link "Connect extension" is in
     the document.
   - `hasActiveKey: true`, non-empty audits → it is not.
2. Server side: in the file that tests `listKeysFor`, add `hasActiveKey`
   cases — no keys → false; one revoked key → false; one active key → true;
   another user's active key → false.

**Verify**: `pnpm test` → all green; `pnpm lint`, `pnpm build` → exit 0.

## Done criteria

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all exit 0
- [ ] `grep -n "Connect extension" src/components/DashboardClient.tsx` →
      inside a `{!hasActiveKey && …}` block
- [ ] ≥2 new component cases + ≥4 new query cases pass
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The app-head excerpt no longer matches the live component.
- `fetchDashboard`'s return shape is consumed anywhere beyond
  `src/routes/dashboard.tsx` (`grep -rn "fetchDashboard" src/`) — at plan
  time the route is the only caller.

## Maintenance notes

- "Connected" here means *an active key exists*, not *the key was ever used*.
  If a stricter signal is ever wanted, `lastUsedAt` is already on the row —
  swap the predicate in `hasActiveKey` only.
- Plan 040 (billing UI) touches `AccountClient`, not these files; plan 034
  touches `DashboardClient` (chart extraction) — a trivial rebase either way.
