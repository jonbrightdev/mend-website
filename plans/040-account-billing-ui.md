# Plan 040: Account billing UI + success/cancel pages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a0f7690..HEAD -- src/components/AccountClient.tsx src/lib/account-fns.ts src/routes/account.tsx`
> Confirm 037 + 038 landed (checkout/portal/webhook routes). Compare
> "Current state" to live code; STOP on mismatch.
>
> **Design source of truth**: `plans/pricing-stripe-design.md` §§ Account
> billing section, Client integration, Success/cancel. Product:
> Free **30d / 200 / 3 / 60 rpm** when enforced; Pro **$9/mo · $90/yr**,
> **2y / 50k / 20 / 300 rpm**.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (session cookies on fetch; misleading plan UI)
- **Depends on**: 037, 038
- **Category**: billing / UI
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

Checkout/portal exist as APIs but users need an Account surface to upgrade,
manage subscription, and see effective limits. Key generate currently swallows
server quota messages. Post-Checkout success must read **DB entitlements**, not
trust `session_id` alone (webhook lag).

No home-page pricing CTA in v1. Extension stays free/offline always.

## Design decisions (already made — do not re-litigate)

- Account UI shows **`effectivePlan`** as current plan badge; also show
  `productPlan` / status / period for “Pro — cancels on …”.
- Checkout/portal via `fetch` + **`credentials: "include"`** + JSON body; then
  `window.location.href = url`.
- **Surface server `Error.message`** on key generate (not only generic text).
- Show “**N of max** active keys”; disable Generate at cap when max known.
- Free banner when `freeLimitsEnforced`: 30 days / 200 audits / 3 keys.
- Success page: loader reads DB `effectivePlan` only; copy allows brief webhook lag.
- Run **`pnpm generate-routes`** after adding `/billing/success` and
  `/billing/cancel`.

## Current state

- `src/lib/account-fns.ts:27-36` — `fetchAccount` returns `{ user, keys, hasPassword }` only.
- `src/components/AccountClient.tsx:13-19` — props: `initialKeys`, `hasPassword`.
- `src/components/AccountClient.tsx:28-50` — `onGenerate` catch sets
  `"Couldn't create a key. Please try again."` only (swallows server message).
- `src/components/AccountClient.tsx:133-140` — Generate disabled only while
  `pending`, not at quota.
- `src/routes/account.tsx:21-42` — passes keys + hasPassword into AccountClient.
- No `/billing/*` routes.
- After 037: `POST /api/billing/checkout`, `POST /api/billing/portal`.
- After 038: subscription mirror populated by webhooks; `beforeDelete` cleanup.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Generate routes | `pnpm generate-routes` | exit 0; route tree includes billing pages |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Component tests | `pnpm test src/components/AccountClient.test.tsx` | all pass |
| Full suite | `pnpm test` | all pass |
| Full CI | `pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build` | all exit 0 |

## Scope

**In scope**:

- `src/lib/account-fns.ts` / `src/lib/account-queries.ts` (or billing-queries)
  — extend `fetchAccount` with `keyQuota` + `billing`
- `src/components/AccountClient.tsx` (+ optional `BillingPanel.tsx`)
- `src/components/AccountClient.test.tsx`
- `src/routes/account.tsx`
- `src/routes/billing/success.tsx` (new)
- `src/routes/billing/cancel.tsx` (new)
- `src/styles/app.css` (minor panel styles only if needed)
- `plans/README.md` (status row)

**Out of scope**:

- Public `/pricing` page, SiteHeader/Footer Pricing link — 041.
- Privacy third-party rewrite — 041.
- Webhook or Stripe SDK changes.
- Flipping `FREE_LIMITS_ENFORCED` in production.
- Home page CTA (explicitly forbidden in v1).

## Git workflow

- Work on `main`. Commit e.g.
  `Add account billing panel and Checkout return pages`.
- Run `pnpm generate-routes` in the same commit as new routes.
- Do NOT push unless instructed.

## STOP conditions

Stop and report if:

- 037/038 not landed (no checkout/portal or no subscription mirror path).
- `fetchAccount` / AccountClient shape diverged so billing props cannot be
  added cleanly.
- createServerFn cannot return the billing DTO without pulling server-only
  modules into the client — follow account-queries split pattern.
- Tempted to call `checkout.sessions.retrieve` on success for “sync” — out of
  scope; DB only.

## Steps

### Step 1: Extend `fetchAccount` payload

Return shape (from design):

```ts
{
  user,
  keys,
  hasPassword,
  keyQuota: { active: number; max: number },
  billing: {
    plan: "free" | "pro",              // effectivePlan
    productPlan: "free" | "pro",       // from price id; free if no row
    status: SubscriptionStatus | null, // null if no subscription row
    currentPeriodEnd: string | null,   // ISO
    cancelAtPeriodEnd: boolean,
    interval: "month" | "year" | null,
    canUpgrade: boolean,  // effective free and billing enabled (not already entitled)
    canManage: boolean,   // has stripeCustomerId in DB
    billingEnabled: boolean, // isBillingEnabled()
    freeLimitsEnforced: boolean,
  },
}
```

Implementation notes:

- Use `getUserEntitlements` for effective plan + max keys.
- Load subscription row for status / productPlan / period / interval /
  cancelAtPeriodEnd.
- Load `user.stripeCustomerId` for `canManage`.
- `isBillingEnabled` from `billing-config` (037).
- `active` = non-revoked keys count; `max` = entitlements.maxActiveApiKeys
  (use a large display number carefully if Infinity — show “∞” or hide cap UI
  when unenforced legacy).

Keep all DB access in server-only modules (account-queries / billing-queries).

### Step 2: Billing panel UI

In `AccountClient` (or sibling `BillingPanel.tsx` imported by it):

- Place **above** Connect extension / Danger zone.
- Badge: Free / Pro from `billing.plan` (effective).
- If Pro / canceling: show period end; if `cancelAtPeriodEnd`, “Cancels on …”.
- Past_due banner: “Payment failed — update your card in the billing portal”.
- Free limits banner when `billing.freeLimitsEnforced`:
  “Free keeps 30 days of history, up to 200 saved audits, and 3 API keys.”
- **Upgrade to Pro** when `canUpgrade && billingEnabled`: monthly/yearly chooser
  (default yearly to match pricing product preference) → `startCheckout`.
- **Manage subscription** when `canManage` → portal fetch.
- Hide Upgrade/Manage when `!billingEnabled`.
- Disable buttons while pending; prevent double-submit.

Client helper (design sketch):

```ts
async function startCheckout(price: "pro_monthly" | "pro_yearly") {
  setPending(true);
  setError(null);
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ price }),
    });
    const data = (await res.json()) as {
      url?: string;
      error?: string;
      code?: string;
    };
    if (!res.ok || !data.url) {
      setError(data.error ?? "Could not start checkout.");
      setPending(false);
      return;
    }
    window.location.href = data.url;
  } catch {
    setError("Could not start checkout.");
    setPending(false);
  }
}
// Portal: POST /api/billing/portal, same credentials pattern
```

Copy constraints: never imply the extension scanner is paid; prefer “Pro
dashboard” / “Pro cloud sync”.

### Step 3: Key quota UX + server errors

- Display “**{active} of {max}** active keys” when max is finite.
- Disable Generate when `active >= max` (and not revealing a fresh key).
- In `onGenerate` catch:

```ts
} catch (e) {
  setError(
    e instanceof Error && e.message
      ? e.message
      : "Couldn't create a key. Please try again.",
  );
}
```

(If createServerFn wraps errors, unwrap the message the framework surfaces —
match existing patterns in AccountClient delete flows if any.)

### Step 4: Wire `account.tsx`

Pass new loader fields into `AccountClient`. Update head description if useful
(“Manage billing and extension keys…”).

### Step 5: Success / cancel routes

`src/routes/billing/success.tsx`:

- Session required (redirect login if missing).
- Loader: read entitlements / subscription from DB for current user.
- UI: MarketingShell; “Thanks — Pro is active” when `effectivePlan === "pro"`;
  else “If Pro isn’t active yet, refresh in a moment.” (webhook lag).
- Do **not** require Stripe retrieve of `session_id` for truth.

`src/routes/billing/cancel.tsx`:

- “Checkout canceled. You can upgrade anytime from Account or Pricing.”
- Link to `/account` and later `/pricing` (041).

```bash
pnpm generate-routes
```

### Step 6: Tests

`AccountClient.test.tsx`:

1. Renders plan badge from billing props.
2. Upgrade button calls fetch with `credentials: "include"` (mock fetch).
3. Generate surfaces server error message (mock `createApiKey` reject with
   Error("Free accounts can have 3…")).
4. Shows “N of max” keys; Generate disabled at cap.
5. Existing postMessage / revoke / OAuth delete tests still pass.

Optional loader tests for success page if easy with existing harness.

**Verify**: full CI green.

## Test plan

Component tests above. Manual: test-mode Checkout → success page after webhook
(or refresh); portal return to `/account`.

## Done criteria

- [ ] `fetchAccount` includes `keyQuota` + `billing` DTO
- [ ] Billing panel: effective plan, status, period, upgrade/manage
- [ ] fetch checkout/portal uses `credentials: "include"`
- [ ] Key generate shows server error messages
- [ ] “N of max keys”; Free banner when enforced
- [ ] `/billing/success` and `/billing/cancel` exist; routes generated
- [ ] Success reads DB only
- [ ] No home-page pricing CTA added
- [ ] `pnpm generate-routes && typecheck && lint && test && build` green
- [ ] No files outside scope
- [ ] `plans/README.md` status row for 040 → DONE

## Maintenance notes

- When 041 lands, success/cancel can deep-link Pricing; account Upgrade can
  also point there for marketing detail.
- Phase C Free tightenings: banner copy must match founder numbers (30/200/3).
- Design reference: `plans/pricing-stripe-design.md` §§ Account billing, Client
  integration, Success/cancel.

When done, update `plans/README.md` status row to DONE.
