# Plan 037: Stripe client + Checkout + Customer Portal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a0f7690..HEAD -- src/lib/session.ts src/db/schema.ts package.json src/routes/api/export.ts`
> Also confirm plan 036 has landed: `src/lib/entitlements.ts`,
> `src/lib/billing-queries.ts`, and `user.stripeCustomerId` exist. If the
> "Current state" excerpts no longer match, treat it as a STOP condition.
>
> **Design source of truth**: `plans/pricing-stripe-design.md` (Checkout /
> Portal flows, race-safe customer create, price map). Product prices:
> **Pro $9/mo · $90/yr**.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (paid path; wrong customer binding or price injection)
- **Depends on**: 036 (schema + entitlements)
- **Category**: billing / payments
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

Schema alone cannot take money. Hosted Stripe Checkout starts a subscription;
Customer Portal lets Pro users cancel, switch monthly↔yearly, and update cards
without Mend owning a card form (PCI + a11y offloaded). This unit adds the
server SDK and the two session-authenticated routes that return hosted URLs.
Webhooks that mirror plan state land in 038 — **do not implement webhooks
here**.

Founder parameters: Pro **$9/mo · $90/yr**. Free tightenings stay off
(`FREE_LIMITS_ENFORCED` default false). Extension stays free/offline always.

## Design decisions (already made — do not re-litigate)

- **First-party Stripe Node SDK** — not better-auth Stripe plugin, not Lemon/Paddle.
- **Hosted Checkout + Portal only** — no Stripe Elements.
- **Session auth only** on checkout/portal (same-origin, no CORS) — pattern like
  `src/routes/api/export.ts`.
- **Billing fields are not on the session.** `currentSessionUser()` /
  Better Auth session only expose `{ id, name, email }`
  (`src/lib/session.ts:10-22`). Always Drizzle-load `stripeCustomerId`.
- **Never accept raw Stripe price IDs from the client.** Body enum
  `pro_monthly` | `pro_yearly` → env price IDs server-side.
- **`allow_promotion_codes: true`** at launch.
- **409 `ALREADY_SUBSCRIBED`** if mirror status is entitling:
  `active | trialing | past_due` **within past_due grace** (use
  `effectivePlan` / same ENTITLING notion — user already has Pro access).
- **503** when `!isBillingEnabled()` (missing secret or price IDs).
- **Race-safe customer create**: conditional `UPDATE … WHERE stripeCustomerId IS NULL`;
  never overwrite a non-null winner.
- **No webhook route** in this unit. Do not enable `FREE_LIMITS_ENFORCED`.

## Current state

After 036 (required):

- `user.stripeCustomerId` column + `subscription` / `stripe_event` tables.
- `src/lib/entitlements.ts` with `effectivePlan`, `PLAN_LIMITS`,
  `PAST_DUE_GRACE_MS`, `areFreeLimitsEnforced`.
- `.env.example` documents Stripe + gate vars (empty defaults).

At baseline / still true:

- `src/lib/session.ts:10-22` — session is `{ id, name, email }` only.
- `src/routes/api/export.ts:9-16` — session via `auth.api.getSession({ headers })`,
  JSON 401 if missing; no CORS.
- `package.json` — no `stripe` dependency until this plan.
- No `src/lib/stripe.ts`, no `/api/billing/*` routes.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Add SDK | `pnpm add stripe` | `stripe` in dependencies |
| Generate routes | `pnpm generate-routes` | exit 0 (if required for new API routes) |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass |
| Full CI | `pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build` | all exit 0 |

## Scope

**In scope**:

- `package.json` / `pnpm-lock.yaml` (`stripe`)
- `src/lib/stripe.ts` (new, server-only)
- `src/lib/billing-config.ts` (new)
- `src/routes/api/billing/checkout.ts` (new)
- `src/routes/api/billing/portal.ts` (new)
- `src/routes/api/billing/checkout.test.ts` (new)
- `src/routes/api/billing/portal.test.ts` (new)
- `plans/README.md` (status row)

**Out of scope**:

- `src/routes/api/billing/webhook.ts` — 038.
- `beforeDelete` Stripe cleanup — 038.
- Account / pricing UI that *calls* these routes — 040 / 041 (routes must work
  without UI).
- Enforcing Free/Pro ingest or key limits — 039.
- Flipping `FREE_LIMITS_ENFORCED` or live Railway secrets (ops, not this commit).
- Stripe Tax, Elements, invoice list UI.

## Git workflow

- Work directly on `main`. Commit e.g.
  `Add Stripe Checkout and Customer Portal routes`.
- Do NOT push unless instructed.

## STOP conditions

Stop and report back if:

- 036 is not landed (missing schema / entitlements modules).
- Session shape already includes `stripeCustomerId` and other code assumes it —
  re-read design; do not dual-write session additionalFields without a design
  change.
- Stripe package install fails or API version pin is unclear — pin to the
  installed package's modern default / basil-era version and document the
  chosen string in `stripe.ts`.
- You are tempted to implement webhooks "while you're here" — stop; that's 038.
- Live export route auth pattern diverged so much that session auth cannot be
  mirrored.

## Steps

### Step 1: Install Stripe SDK

```bash
pnpm add stripe
```

Types ship with modern `stripe` packages.

### Step 2: Server-only Stripe client

New `src/lib/stripe.ts`:

```ts
import "@tanstack/react-start/server-only";
import Stripe from "stripe";

// Pin explicitly at implement time to the API version of the installed
// `stripe` package. Prefer a modern basil+ pin (2025-03-31.basil or later)
// so period fields live on SubscriptionItem (038). Do NOT put
// STRIPE_SECRET_KEY in any VITE_* variable.
const key = process.env.STRIPE_SECRET_KEY;
if (!key && process.env.NODE_ENV === "production") {
  // Prefer lazy throw on first use if you need builds without secrets;
  // either way secrets must never be VITE_*.
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Replace with the SDK's documented API version for the installed package
  // if different — prefer basil+ modern pin.
  apiVersion: "2025-06-30.basil",
  typescript: true,
});
```

If TypeScript rejects the apiVersion string, use the union member the installed
`stripe` types export (still modern). Document the final pin in a one-line
comment. **Do not** invent a custom fetch wrapper.

### Step 3: Billing config

New `src/lib/billing-config.ts` (may be pure env helpers — no Stripe network):

```ts
export type CheckoutPriceKey = "pro_monthly" | "pro_yearly";

/** Pro: $9/mo · $90/yr (founder-approved). Price *IDs* come from env. */
export function isBillingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_PRICE_PRO_MONTHLY &&
      env.STRIPE_PRICE_PRO_YEARLY,
  );
}

export function priceIdFor(
  key: CheckoutPriceKey,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const id =
    key === "pro_monthly"
      ? env.STRIPE_PRICE_PRO_MONTHLY
      : env.STRIPE_PRICE_PRO_YEARLY;
  if (!id) throw new Error(`Missing Stripe price id for ${key}`);
  return id;
}

export function parseCheckoutPrice(body: unknown): CheckoutPriceKey {
  if (
    body &&
    typeof body === "object" &&
    "price" in body &&
    ((body as { price: unknown }).price === "pro_monthly" ||
      (body as { price: unknown }).price === "pro_yearly")
  ) {
    return (body as { price: CheckoutPriceKey }).price;
  }
  throw new Error("Invalid price");
}
```

Unit-test `isBillingEnabled` / `parseCheckoutPrice` if small pure tests are
cheap; route tests cover the rest.

### Step 4: POST `/api/billing/checkout`

New `src/routes/api/billing/checkout.ts` following `export.ts` route style:

1. If `!isBillingEnabled()` → **503** `{ error: "Billing is not configured." }`.
2. `auth.api.getSession({ headers: request.headers })` → **401** if missing.
3. `userId = session.user.id`.
4. Drizzle-load billing row:

```ts
const [row] = await db
  .select({
    id: user.id,
    email: user.email,
    name: user.name,
    stripeCustomerId: user.stripeCustomerId,
  })
  .from(user)
  .where(eq(user.id, userId))
  .limit(1);
if (!row) return Response.json({ error: "Unauthorized" }, { status: 401 });
```

5. **Race-safe customer create** when `stripeCustomerId` is null:
   - `stripe.customers.create({ email, name, metadata: { userId } })`
   - `UPDATE user SET stripeCustomerId = customer.id WHERE id = userId AND stripeCustomerId IS NULL`
   - If 0 rows updated: re-SELECT; prefer DB winner; do **not** overwrite; log orphan customer id for manual cleanup.
6. Load subscription mirror for `userId`. If present and **still entitled Pro**
   (`effectivePlan` → `"pro"` for that product/status/period, or status in
   `active|trialing|past_due` with grace) → **409**
   `{ error: "…", code: "ALREADY_SUBSCRIBED" }`.
7. Parse body `{ price: "pro_monthly" | "pro_yearly" }` → **400** on invalid.
8. `stripe.checkout.sessions.create`:
   - `mode: "subscription"`
   - `customer: <stripeCustomerId>`
   - `line_items: [{ price: priceIdFor(key), quantity: 1 }]`
   - `success_url: ${BETTER_AUTH_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url: ${BETTER_AUTH_URL}/billing/cancel`
   - `client_reference_id: userId`
   - `subscription_data.metadata: { userId }`
   - `allow_promotion_codes: true`
9. Return `{ url: session.url }`.

No CORS headers. Never log full customer objects.

### Step 5: POST `/api/billing/portal`

New `src/routes/api/billing/portal.ts`:

1. `!isBillingEnabled()` → 503.
2. Session required → 401.
3. Drizzle-load `stripeCustomerId`. If null → **400**
   `{ error: "No billing account yet." }`.
4. `stripe.billingPortal.sessions.create({
     customer,
     return_url: `${process.env.BETTER_AUTH_URL}/account`,
   })`
5. Return `{ url }`.

### Step 6: Tests with mocked Stripe

`checkout.test.ts` / `portal.test.ts` (Vitest + `createTestDb` + dynamic import
of route handlers; mock `stripe` module methods):

**Checkout**

1. No session → 401.
2. Billing disabled (empty env) → 503.
3. Creates customer when null, writes `user.stripeCustomerId`, returns url.
4. Concurrent-style: second path where customer id already set reuses it (no
   second create if you seed the column).
5. Invalid body price → 400.
6. Active Pro subscription seeded → 409 `ALREADY_SUBSCRIBED`.
7. Happy path monthly/yearly maps to correct env price id in
   `checkout.sessions.create` mock args.
8. Assert `allow_promotion_codes: true` in create args.

**Portal**

1. No session → 401.
2. No `stripeCustomerId` → 400.
3. Happy path returns portal url; `return_url` ends with `/account`.

Mock pattern: `vi.mock("@/lib/stripe", …)` or inject — pick the style that
matches existing vitest mocks in the repo (see account component mocks). Do
not hit real Stripe.

Run `pnpm generate-routes` if the route tree does not pick up new files (API
routes under `src/routes/api` typically use `createFileRoute`; follow whatever
the local router plugin expects — if build fails on missing routes, generate).

**Verify**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Test plan

Route tests above. Manual (optional, maintenance notes): Stripe test mode +
CLI is for 038 webhooks; checkout can be smoke-tested after 040 UI.

## Done criteria

- [ ] `pnpm add stripe` committed in lockfile
- [ ] `src/lib/stripe.ts` imports server-only; no `VITE_*` secret
- [ ] Checkout + portal routes exist; session auth; Drizzle for customer id
- [ ] 409 on already entitled Pro; 503 when billing disabled
- [ ] `allow_promotion_codes: true`
- [ ] Client cannot pass raw price ids
- [ ] No webhook route; no `FREE_LIMITS_ENFORCED=true` flip
- [ ] `pnpm typecheck` / `lint` / `test` / `build` green
- [ ] No files outside scope (`git status`)
- [ ] `plans/README.md` status row for 037 → DONE

## Maintenance notes

- Portal product configuration (allow cancel at period end, plan switch) is in
  the **Stripe Dashboard**, not code.
- Success/cancel pages are 040; until then success_url 404s are acceptable in
  pure API testing.
- Design reference: `plans/pricing-stripe-design.md` §§ Checkout, Customer
  Portal, Client integration, Rollout phase B.

When done, update `plans/README.md` status row to DONE.
