# Plan 038: Stripe webhooks + beforeDelete cleanup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a0f7690..HEAD -- src/lib/auth.ts src/db/schema.ts src/lib/stripe.ts src/routes/api/billing/`
> Confirm 036 + 037 landed (schema, stripe client, checkout/portal). Compare
> "Current state" against live code; STOP on mismatch.
>
> **Design source of truth**: `plans/pricing-stripe-design.md` — webhook
> pipeline, stale-id guard, basil item periods, fail-closed `beforeDelete`.
> **Ship `beforeDelete` in this unit**, not later.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH (billing correctness; orphan paid subs; stale mirror clobber)
- **Depends on**: 036, 037
- **Category**: billing / webhooks
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

Checkout creates a Stripe subscription; **webhooks** are the only trusted
path that mirrors status/period into Postgres for server-side entitlements.
Without transactional idempotency, Stripe retries double-apply or leave events
half-processed. Without a stale-id guard, a late `deleted` for `sub_old` after
resubscribe can drop Pro while `sub_new` is active. Without **fail-closed
`beforeDelete`**, a Pro user who deletes their Mend account can keep billing.

Founder parameters remain: Pro **$9/mo · $90/yr**; Free when enforced
**30d / 200 audits / 3 keys / 60 rpm**; Pro **2y / 50k / 20 keys / 300 rpm**.
Do not flip `FREE_LIMITS_ENFORCED` here.

## Design decisions (already made — do not re-litigate)

- **Raw body** + `stripe.webhooks.constructEvent` — never `request.json()` first.
- **Pipeline**: verify → optional event pre-check → **ALL Stripe HTTP retrieves
  outside any DB transaction** → short TX (`INSERT stripe_event` + pure DB
  upsert). Unique violation → **ROLLBACK + 200**. Apply failure → **ROLLBACK +
  500**. Success → 200.
- **`productPlan` always from price id**, not status. Periods from
  **SubscriptionItem** `items.data[0].current_period_*` (basil+ APIs).
  Missing periods → throw inside apply (no event row; Stripe retries).
- **`shouldApplySubscriptionMirror`**: accept if no row; same sub id; or
  different id with entitling status (`active|trialing|past_due`). Reject
  non-entitling events for non-current ids (stale deleted).
- **Invoice events**: retrieve subscription then upsert — do not patch status
  from the invoice object alone. Note: on basil+ API pins,
  `Invoice.subscription` no longer exists (removed in the same release that
  moved period fields to SubscriptionItem) — the subscription id lives at
  `invoice.parent.subscription_details.subscription`. Follow the installed
  SDK's `Stripe.Invoice` type; this is expected, not drift.
- **`beforeDelete` fail closed** when `stripeCustomerId` present and Stripe
  cancel/delete fails. If no customer id, proceed. Load customer id from DB
  (session user does not include it).
- better-auth@1.6.17 supports `user.deleteUser.beforeDelete` — use it.

## Current state

- `src/lib/auth.ts:50-55` — `user: { deleteUser: { enabled: true } }` with
  **no** `beforeDelete`.
- `src/lib/session.ts:10-22` — session user has no `stripeCustomerId`.
- After 036: `subscription`, `stripe_event`, `user.stripeCustomerId`.
- After 037: `src/lib/stripe.ts`, checkout/portal routes; **no** webhook route.
- Account delete client: `AccountClient` → `authClient.deleteUser` (password or
  empty for OAuth) — server hook runs inside Better Auth.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass |
| Full CI | `pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build` | all exit 0 |

Local Stripe CLI (manual, not CI):  
`stripe listen --forward-to localhost:3000/api/billing/webhook`

## Scope

**In scope**:

- `src/routes/api/billing/webhook.ts` (new)
- `src/lib/billing-webhooks.ts` (new — pure-ish helpers + upsert)
- `src/lib/billing-webhooks.test.ts` (new — required scenarios below)
- `src/routes/api/billing/webhook.test.ts` (new — HTTP + signature boundary)
- `src/lib/auth.ts` — `beforeDelete` Stripe cleanup
- Auth delete / beforeDelete tests (new or extend existing auth tests; mock Stripe)
- `plans/README.md` (status row)

**Out of scope**:

- Free limit enforcement on ingest/keys (039).
- Account billing UI / success page (040).
- Pricing page / privacy (041).
- Changing Checkout/Portal behavior except shared helpers if extracted.
- Cron retention, Team seats.

## Git workflow

- Work on `main`. Commit e.g.
  `Add Stripe webhooks and fail-closed account-delete cleanup`.
- Do NOT push unless instructed.

## STOP conditions

Stop and report if:

- 036/037 missing.
- better-auth version no longer exposes `beforeDelete` on `deleteUser` — verify
  in `node_modules/better-auth` before inventing a different hook.
- You cannot get raw body in the TanStack Start route handler (framework
  consumes body) — stop and report; do not skip signature verification.
- Tempted to hold a Postgres transaction open across `stripe.*.retrieve` —
  that violates the design; restructure instead.
- Tempted to defer `beforeDelete` to a later plan — **not allowed**.

## Steps

### Step 1: Webhook helpers (`billing-webhooks.ts`)

Implement (sketches from design — flesh out types to match installed Stripe SDK):

```ts
export function periodFromSubscription(sub: Stripe.Subscription): {
  start: Date;
  end: Date;
} {
  const item = sub.items.data[0];
  if (!item?.current_period_start || !item?.current_period_end) {
    throw new Error(`subscription ${sub.id} missing item period fields`);
  }
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  };
}

export function planFromPriceId(priceId: string): "pro" | "free" {
  if (
    priceId === process.env.STRIPE_PRICE_PRO_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PRO_YEARLY
  ) {
    return "pro";
  }
  return "free"; // unknown → safe; log error
}

export function intervalFromPriceId(priceId: string): "month" | "year" | null {
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return "month";
  if (priceId === process.env.STRIPE_PRICE_PRO_YEARLY) return "year";
  return null;
}

const ENTITLING: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

export function shouldApplySubscriptionMirror(
  existing: { stripeSubscriptionId: string; status: string } | null,
  incoming: { id: string; status: string },
): boolean {
  if (!existing) return true;
  if (existing.stripeSubscriptionId === incoming.id) return true;
  if (ENTITLING.has(incoming.status)) return true;
  return false;
}

export async function upsertFromStripeSubscription(
  tx: /* Drizzle tx */,
  userId: string,
  sub: Stripe.Subscription,
): Promise<"applied" | "ignored_stale"> {
  // SELECT existing by userId
  // if !shouldApply → return "ignored_stale"
  // price id from items.data[0]; productPlan = planFromPriceId
  // periods = periodFromSubscription(sub)
  // UPDATE by userId or INSERT (id = crypto.randomUUID())
  // overwrite stripeSubscriptionId on resubscribe
  // return "applied"
}
```

Resolve `userId` (outside TX, may call Stripe):  
1) `subscription.metadata.userId` →  
2) customer metadata / `customers.retrieve` →  
3) `user.stripeCustomerId === customer` DB lookup.

Events to handle:

| Event | Action |
|-------|--------|
| `checkout.session.completed` | If subscription mode + subscription id: retrieve sub → prepare upsert |
| `customer.subscription.created` | Upsert from object (retrieve if incomplete) |
| `customer.subscription.updated` | Upsert (status, price→plan, item periods, cancel_at_period_end) |
| `customer.subscription.deleted` | Upsert status `canceled` **only if** mirror id matches (stale guard) |
| `invoice.paid` | Retrieve subscription → upsert (sub id from `invoice.parent.subscription_details.subscription` on basil+) |
| `invoice.payment_failed` | Retrieve subscription → upsert (expect past_due; same basil+ field) |

### Step 2: POST `/api/billing/webhook`

```
(1) rawBody = await request.text()
(2) constructEvent(rawBody, stripe-signature, STRIPE_WEBHOOK_SECRET)
    → 400 on failure
(3) Optional: SELECT stripe_event WHERE id = event.id → if found, 200
(4) Resolve userId + prepare Stripe.Subscription — ALL network here
    → 500 on Stripe network failure (no event row)
    → if user gone and event can never apply: log + 200
(5) BEGIN
      INSERT stripe_event (id, type)
      -- unique violation: ROLLBACK → 200
      applyPreparedUpsert (may no-op stale)
    COMMIT → 200
    apply throws: ROLLBACK → 500
```

**Invariant:** never insert `stripe_event` before Stripe retrieves complete;
never leave an event row after a failed apply.

No session auth. No CORS.

### Step 3: Required tests (`billing-webhooks.test.ts` + route tests)

Fixtures **must** be basil-shaped (periods on `items.data[0]`, not
subscription-level `current_period_*`).

1. **Mid-fail retry**: apply throws after partial DB work → no `stripe_event`
   row retained; retry with same `evt_…` succeeds and mirrors correctly.
2. **Double delivery**: second delivery returns 200; subscription row unchanged.
3. **Cancel → resubscribe**: new `sub_…` on same `userId` → mirror shows
   `sub_new` active (overwrite `stripeSubscriptionId`).
4. **Stale deleted for `sub_old`**: mirror is `sub_new` active; deliver
   `customer.subscription.deleted` for `sub_old` → **mirror unchanged**,
   `stripe_event` present, HTTP 200.
5. Optional: non-entitling `updated` for `sub_old` → no-op mirror.
6. Invoice path: mock retrieve then upsert; assert no open transaction during
   mock Stripe call (call order / spy).
7. Signature failure → 400.

### Step 4: `beforeDelete` in `auth.ts`

Extend `user.deleteUser` (load customer id from DB — session lacks it):

```ts
user: {
  deleteUser: {
    enabled: true,
    beforeDelete: async (sessionUser) => {
      const [row] = await db
        .select({ stripeCustomerId: user.stripeCustomerId })
        .from(user)
        .where(eq(user.id, sessionUser.id))
        .limit(1);
      if (!row?.stripeCustomerId) return; // free path

      try {
        // 1. List subscriptions for customer; cancel each immediately
        // 2. stripe.customers.del(row.stripeCustomerId)
      } catch (e) {
        console.error("stripe cleanup failed before account delete", e);
        throw new Error(
          "Could not cancel your subscription before deleting the account. Please try again or contact support.",
        );
      }
    },
  },
},
```

Tests (mock Stripe):

1. No `stripeCustomerId` → beforeDelete resolves; no Stripe calls.
2. With customer id → cancel + delete customer called.
3. Stripe throws → beforeDelete throws (fail closed).

### Step 5: Full suite

`pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Test plan

Required scenarios above. Manual: Stripe CLI forward + test card after UI (040).

## Done criteria

- [ ] Webhook verifies signature on raw body
- [ ] Network outside TX; short TX for event + upsert only
- [ ] Unique event → 200; apply failure → 500 + no retained event
- [ ] productPlan from price id; periods from SubscriptionItem
- [ ] `shouldApplySubscriptionMirror` + tests for stale `sub_old` deleted
- [ ] cancel→resubscribe, double delivery, mid-fail retry tests pass
- [ ] `beforeDelete` fail-closed when Stripe fails and customer id present
- [ ] `pnpm typecheck` / `lint` / `test` / `build` green
- [ ] No Free limits flag flip
- [ ] No files outside scope
- [ ] `plans/README.md` status row for 038 → DONE

## Maintenance notes

- Stripe Dashboard webhook endpoint: `https://<host>/api/billing/webhook`
  for the event types listed above.
- Local: `stripe listen --forward-to localhost:3000/api/billing/webhook`; copy
  CLI `whsec_…` into `.env` as `STRIPE_WEBHOOK_SECRET`.
- After account delete, webhooks for missing users: log + 200.
- Design reference: `plans/pricing-stripe-design.md` §§ Webhooks, Upsert,
  Account delete, Rollout (account-delete cleanup not optional after live Pro).

When done, update `plans/README.md` status row to DONE.
