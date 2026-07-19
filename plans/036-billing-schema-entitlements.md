# Plan 036: Billing schema + entitlements core

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a0f7690..HEAD -- src/db/schema.ts src/test/db.ts .env.example package.json`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Design source of truth**: `plans/pricing-stripe-design.md` (algorithms,
> founder product numbers, schema shapes). Do not re-litigate product limits.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (migration is additive but wrong columns are expensive to undo)
- **Depends on**: none
- **Category**: billing / foundation
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

There is no monetization path and no plan-aware limit surface. Before Checkout,
webhooks, or enforcement can land, the database must mirror Stripe subscription
state and a pure entitlements module must turn that mirror into Free vs Pro
limits. This unit is **additive only**: schema + pure helpers + env
documentation. Free product tightenings stay **off** by default
(`FREE_LIMITS_ENFORCED` unset/false) so `main` stays safe mid-rollout.

Founder-approved product parameters (must stay consistent across billing plans):

| Tier | Price | Retention | Audit cap | API keys | Ingest rpm |
|------|-------|-----------|-----------|----------|------------|
| Free (when enforced) | — | **30 days** | **200** | **3** | **60** |
| Pro | **$9/mo · $90/yr** | **2 years** | **50_000** | **20** | **300** |

Extension stays free/offline always. No home-page pricing CTA in v1.

## Design decisions (already made — do not re-litigate)

- **`user.stripeCustomerId` only** on the Better Auth `user` table; do **not**
  register it as `user.additionalFields` (billing PII stays off the session
  cookie payload — see `src/lib/session.ts`).
- **`subscription` table** is the plan/status mirror; free users have **no
  row**. Never store a synthetic status `"none"`.
- **`subscription.plan`** is the **product purchased from price id**
  (`"pro"` / `"free"`), **not** current entitlement. Entitlement is always
  `effectivePlan({ productPlan, status, currentPeriodEnd, now })`.
- **`stripe_event`** PK = Stripe `event.id` for idempotency. Insert only in
  the same short DB transaction as a successful (or intentional no-op) apply
  — that wiring lands in 038; this unit only creates the table.
- **No redundant index** on `stripeSubscriptionId` when `.unique()` already
  creates one. `userId` gets an explicit unique index (one personal mirror).
- **No Stripe package** in this unit. No network. No ingest enforcement.
- **Migration only via `pnpm db:generate`** — never hand-write SQL; Railway
  runs `pnpm db:migrate` (`railway.json`).

## Current state

Relevant live anchors at plan time (`a0f7690`):

- `src/db/schema.ts:18-26` — `user` has id, name, email, emailVerified, image,
  createdAt, updatedAt. **No** `stripeCustomerId`.
- `src/db/schema.ts` — no `subscription` or `stripe_event` tables.
- `drizzle/` — migrations `0000`, `0001`, `0002` only; next generate should be
  `0003_*.sql` + `drizzle/meta/*`.
- `src/lib/session.ts:10-22` — session user is only `{ id, name, email }`.
- `src/lib/account-queries.ts:41-47` — hardcoded `MAX_ACTIVE_KEYS = 20` and
  flat `assertKeyQuota` (enforcement becomes plan-aware in 039; do not change
  it here).
- `src/lib/rate-limit.ts` — pure fixed-window limiter; ingest uses a single
  60/min instance (`src/routes/api/ingest.ts:33`). Dual limiters land in 039.
- `src/test/db.ts:12-26` — replays **all** `drizzle/*.sql` into PGlite in
  sorted order; new migrations appear in tests automatically.
- `.env.example` — no Stripe or launch-gate vars.
- `package.json` — no `stripe` dependency (037 adds it).

There is no `src/lib/entitlements.ts` or `src/lib/billing-queries.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Generate migration | `pnpm db:generate` | new `drizzle/0003_*.sql` + meta snapshot; exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass |
| Full CI set | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | all exit 0 |

## Scope

**In scope** (the only files you should modify/create):

- `src/db/schema.ts`
- `drizzle/0003_*.sql` + `drizzle/meta/*` (**only** via `pnpm db:generate`)
- `src/lib/entitlements.ts` (new)
- `src/lib/entitlements.test.ts` (new)
- `src/lib/billing-queries.ts` (new)
- `src/lib/billing-queries.test.ts` (new)
- `.env.example`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `package.json` / lockfile — do **not** add `stripe` (037).
- `src/routes/api/ingest.ts`, rate limit dual path, audit cap — 039.
- Checkout / portal / webhook routes — 037 / 038.
- `src/lib/auth.ts` `beforeDelete` — 038.
- Account / pricing UI — 040 / 041.
- Hand-written SQL files.
- Enabling `FREE_LIMITS_ENFORCED` or `RETENTION_PURGE_ENABLED` in production.

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Commit message style: short imperative sentence, e.g.
  `Add billing schema and pure entitlements module`.
- Do NOT push unless the operator instructed it.
- Commit the generated migration SQL **and** `drizzle/meta/*` together with
  the schema change.

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm db:generate` fails or produces a destructive migration (drops columns
  / tables unrelated to billing).
- You are tempted to hand-write or hand-edit generated SQL beyond trivial
  formatting — STOP; fix the schema and re-generate.
- Live `src/db/schema.ts` no longer matches "Current state" (e.g. billing
  columns already landed).
- You need the Stripe SDK or network calls to complete this unit.
- `createTestDb` stops replaying migrations automatically (harness changed).

## Steps

### Step 1: Extend schema

In `src/db/schema.ts`, extend `user` and add tables. Align with Better Auth
column naming; do not rename existing columns.

```ts
// On user — after updatedAt:
stripeCustomerId: text("stripeCustomerId").unique(),

export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(), // our UUID, stable across resubscribes
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripeSubscriptionId").notNull().unique(),
    stripePriceId: text("stripePriceId").notNull(),
    // productPlan: from price id ONLY — not entitlement
    plan: text("plan").$type<"free" | "pro">().notNull(),
    // raw Stripe status — free users have NO row (no synthetic "none")
    status: text("status")
      .$type<
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused"
      >()
      .notNull(),
    currentPeriodStart: timestamp("currentPeriodStart"),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
    canceledAt: timestamp("canceledAt"),
    interval: text("interval").$type<"month" | "year" | null>(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscription_user_uidx").on(t.userId),
    // stripeSubscriptionId already .unique() — no second index
  ],
);

export const stripeEvent = pgTable("stripe_event", {
  id: text("id").primaryKey(), // evt_...
  type: text("type").notNull(),
  processedAt: timestamp("processedAt").notNull().defaultNow(),
});
```

Ensure `uniqueIndex` is already imported from `drizzle-orm/pg-core` (it is, at
schema line 9).

**Verify**: `pnpm typecheck` → exit 0 (schema only).

### Step 2: Generate migration

```bash
pnpm db:generate
```

Expected: new `drizzle/0003_*.sql` adding `user.stripeCustomerId`,
`subscription`, `stripe_event`, plus updated `drizzle/meta/*` and journal.

**STOP** if generate fails or the SQL drops unrelated objects. Do not invent
`0003_…sql` by hand.

**Verify**: `ls drizzle/*.sql` shows a new file; skim SQL for ADD COLUMN /
CREATE TABLE only.

### Step 3: Pure entitlements module

New file `src/lib/entitlements.ts` (pure: no `@/db`, no Stripe, no server-only
import — unit-testable without PGlite):

```ts
export type PlanId = "free" | "pro";

/** Stripe subscription statuses we mirror. Free users have no subscription row. */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface PlanLimits {
  plan: PlanId; // effective plan
  ingestPerMinute: number;
  maxActiveApiKeys: number;
  auditRetentionDays: number;
  maxStoredAudits: number; // Infinity = no cap (legacy free when unenforced)
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    plan: "free",
    ingestPerMinute: 60,
    maxActiveApiKeys: 3,
    auditRetentionDays: 30,
    maxStoredAudits: 200,
  },
  pro: {
    plan: "pro",
    ingestPerMinute: 300,
    maxActiveApiKeys: 20,
    auditRetentionDays: 730, // 2 years
    maxStoredAudits: 50_000,
  },
};

/** Pre-billing Free behavior when FREE_LIMITS_ENFORCED is not true. */
export const LEGACY_FREE_LIMITS: PlanLimits = {
  plan: "free",
  ingestPerMinute: 60,
  maxActiveApiKeys: 20,
  auditRetentionDays: Number.POSITIVE_INFINITY,
  maxStoredAudits: Number.POSITIVE_INFINITY,
};

export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function effectivePlan(input: {
  productPlan: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  now?: Date;
}): PlanId {
  const now = input.now ?? new Date();
  if (input.productPlan !== "pro") return "free";

  switch (input.status) {
    case "active":
    case "trialing":
      return "pro";
    case "past_due": {
      // Keep Pro while Stripe retries, up to period end + 7 days.
      // Null periodEnd → free (broken mirror; do not invent infinite grace).
      if (!input.currentPeriodEnd) return "free";
      if (now.getTime() <= input.currentPeriodEnd.getTime() + PAST_DUE_GRACE_MS) {
        return "pro";
      }
      return "free";
    }
    case "canceled": {
      if (input.currentPeriodEnd && now.getTime() < input.currentPeriodEnd.getTime()) {
        return "pro";
      }
      return "free";
    }
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "free";
    default:
      return "free";
  }
}

export function limitsFor(
  effective: PlanId,
  opts?: { freeLimitsEnforced: boolean },
): PlanLimits {
  if (effective === "pro") return PLAN_LIMITS.pro;
  if (opts?.freeLimitsEnforced === false) return LEGACY_FREE_LIMITS;
  return PLAN_LIMITS.free;
}

/** True only when FREE_LIMITS_ENFORCED === "true" (string compare). */
export function areFreeLimitsEnforced(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FREE_LIMITS_ENFORCED === "true";
}
```

`src/lib/entitlements.test.ts` — required matrix:

1. `productPlan: "free"` → always free regardless of status.
2. Pro + `active` / `trialing` → pro.
3. Pro + `past_due` + periodEnd in future → pro.
4. Pro + `past_due` + now past periodEnd + 7d → free.
5. Pro + `past_due` + **`currentPeriodEnd: null` → free** (safe fail).
6. Pro + `canceled` + now before periodEnd → pro.
7. Pro + `canceled` + now after periodEnd → free.
8. Pro + `unpaid` | `incomplete` | `incomplete_expired` | `paused` → free.
9. `limitsFor("free", { freeLimitsEnforced: false })` → legacy (20 keys, ∞ audits).
10. `limitsFor("free", { freeLimitsEnforced: true })` → 3 keys, 200 audits, 30d.
11. `limitsFor("pro", …)` → always PLAN_LIMITS.pro regardless of enforce flag.
12. `areFreeLimitsEnforced` true only for exact `"true"`.

**Verify**: `pnpm test src/lib/entitlements.test.ts` → all pass.

### Step 4: Billing queries (server-only)

New `src/lib/billing-queries.ts` — same discipline as `account-queries.ts`
(imports `@/db`; only imported from server routes / server fns / tests after
`createTestDb`):

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscription } from "@/db/schema";
import {
  areFreeLimitsEnforced,
  effectivePlan,
  limitsFor,
  type PlanLimits,
  type PlanId,
  type SubscriptionStatus,
} from "@/lib/entitlements";

export async function getUserEntitlements(userId: string): Promise<PlanLimits> {
  const enforced = areFreeLimitsEnforced();
  const row = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);
  if (row.length === 0) return limitsFor("free", { freeLimitsEnforced: enforced });
  const s = row[0]!;
  const effective = effectivePlan({
    productPlan: s.plan as PlanId,
    status: s.status as SubscriptionStatus,
    currentPeriodEnd: s.currentPeriodEnd,
  });
  return limitsFor(effective, { freeLimitsEnforced: enforced });
}

/** Test helper: insert a Pro active subscription for userId. */
export async function seedProSubscription(userId: string): Promise<void> {
  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(subscription).values({
    id: crypto.randomUUID(),
    userId,
    stripeSubscriptionId: `sub_test_${userId}`,
    stripePriceId: "price_test_pro_monthly",
    plan: "pro",
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    interval: "month",
  });
}
```

`src/lib/billing-queries.test.ts`:

1. No subscription row + unenforced env → legacy free limits (20 keys, ∞ max audits).
2. No row + `FREE_LIMITS_ENFORCED=true` → free product limits (3 / 200 / 30).
3. After `seedProSubscription` → pro limits (300 rpm, 20 keys, 50k, 730d) even when free limits enforced.
4. past_due with null period end row → free (if you seed that status).

Toggle env carefully in tests (save/restore `process.env.FREE_LIMITS_ENFORCED`).

**Verify**: `pnpm test src/lib/billing-queries.test.ts` → all pass.

### Step 5: Document env vars

Append to `.env.example` (server-only except optional publishable key):

```bash
# --- Stripe (server-only except publishable key) ---
# Test keys for local; live keys only on Railway production.
# Billing is disabled until STRIPE_SECRET_KEY + both price IDs are set (see 037).
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# Price IDs from Stripe Dashboard (Products → Mend Pro)
# Pro: $9/mo · $90/yr (founder-approved)
STRIPE_PRICE_PRO_MONTHLY=
STRIPE_PRICE_PRO_YEARLY=
# Optional: not required for Checkout redirect (hosted Checkout needs no client SDK)
VITE_STRIPE_PUBLISHABLE_KEY=

# --- Launch gates (server-only) ---
# When unset/false: Free product tightenings (3 keys, 200 audit cap, retention
# purge) are NOT applied — pre-billing behavior (20 keys, unbounded storage).
# Set true only after Checkout + Portal + pricing UI are live (phase C).
FREE_LIMITS_ENFORCED=false
# Independent kill-switch for retention DELETE. Default false until founder
# sign-off on 30-day Free retention.
RETENTION_PURGE_ENABLED=false
```

Defaults documented as false; do not flip production flags in this unit.

**Verify**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` → all green.

## Test plan

Covered in Steps 3–4. Full suite must stay green (existing ingest/account tests
must not depend on new tables beyond migration replay).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm db:generate` was used; migration + meta committed; no hand-written SQL
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0, including entitlements + billing-queries suites
- [ ] `grep -n "stripeCustomerId" src/db/schema.ts` → match on user table
- [ ] `grep -n "subscription_user_uidx" src/db/schema.ts` → 1 match
- [ ] `grep -n '"none"' src/lib/entitlements.ts src/db/schema.ts` → no status `"none"`
- [ ] `grep -n "stripe" package.json` → no stripe dependency yet
- [ ] No ingest / assertKeyQuota enforcement changes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 036 → DONE

## Maintenance notes

- Founder numbers live in `PLAN_LIMITS` / `LEGACY_FREE_LIMITS`. Changing prices
  is a Stripe Dashboard + env concern (037); changing Free/Pro caps is an
  entitlements + product-copy change across 039–041.
- `seedProSubscription` is for tests only; production mirror is webhook-driven
  (038).
- Later units (037–041) depend on this schema and `getUserEntitlements`.
- Design reference: `plans/pricing-stripe-design.md` §§ Data Model, Entitlements,
  Rollout phase A.

When done, update `plans/README.md` status row to DONE.
