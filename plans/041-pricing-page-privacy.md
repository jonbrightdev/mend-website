# Plan 041: Pricing page + nav/footer + privacy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat a0f7690..HEAD -- src/components/SiteHeader.tsx src/components/SiteFooter.tsx src/routes/privacy.tsx src/routes/index.tsx`
> Confirm 037 landed (checkout route for signed-in Pro CTAs). Compare
> "Current state" to live code; STOP on mismatch.
>
> **Design source of truth**: `plans/pricing-stripe-design.md` §§ UI Surfaces,
> Privacy, Copy constraints. Founder params: Pro **$9/mo · $90/yr**; Free
> **30d · 200 audits · 3 keys · 60 rpm**; Pro **2y · 50k · 20 keys · 300 rpm**.
> **No home-page pricing CTA in v1.** Extension stays free/offline always.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MEDIUM (copy/privacy; accidental home CTA)
- **Depends on**: 037 (Checkout CTAs for signed-in users)
- **Category**: billing / marketing / privacy
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

Public pricing is the self-serve entry for Pro. Nav must surface Pricing
without cluttering the extension-focused home hero. Privacy still claims “no
third parties,” which is false once Stripe (and already Resend/OAuth) exist —
must be fixed before paid launch.

## Design decisions (already made — do not re-litigate)

- **`/pricing`**: Free vs Pro vs Team “coming soon”.
- **Monthly/yearly toggle; default yearly** ($9 / $90 display).
- **Logged-out Pro CTA → `/signup`** with copy: “Create a free account, then
  return here to upgrade.” **Do not use `/signup?next=/pricing`** unless you
  also implement an allowlisted `next` param (login/signup do not support it
  today) — design default is **no `next`**.
- Signed-in Free → `startCheckout` (same pattern as account panel).
- Signed-in already Pro → link to Account / Manage portal, not a second Checkout.
- **SiteHeader** `NavPage` + “Pricing” link; **SiteFooter** Pricing next to Privacy.
- **No home page CTA** (founder).
- Privacy: Stripe as payment processor; fix absolute “no third parties” claim;
  optional honesty for OAuth/Resend.
- Run **`pnpm generate-routes`** after adding `/pricing`.

## Current state

- No `src/routes/pricing.tsx`.
- `src/components/SiteHeader.tsx:6-13` — `NavPage` union: home | privacy |
  support | login | signup | dashboard | account — **no** `"pricing"`.
- `src/components/SiteHeader.tsx:38-52` — nav links: Home, Privacy, Support,
  GitHub, then auth.
- `src/components/SiteFooter.tsx:18-22` — GitHub, Privacy, Support only.
- `src/routes/privacy.tsx:94-95` — “Mend uses no third-party services and
  shares data with no one.”
- `src/routes/index.tsx` — hero CTAs are Chrome store + GitHub only (keep it
  that way).
- `src/components/MarketingShell.tsx` — passes `current: NavPage` to header.
- After 037: checkout/portal APIs available when billing enabled.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Generate routes | `pnpm generate-routes` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | all pass |
| Full CI | `pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build` | all exit 0 |

## Scope

**In scope**:

- `src/routes/pricing.tsx` (new)
- `src/components/SiteHeader.tsx` (`NavPage` + Pricing link)
- `src/components/SiteFooter.tsx`
- `src/routes/privacy.tsx`
- `src/styles/globals.css` (pricing layout only if needed)
- `README.md` (optional one-line: optional Pro dashboard)
- `plans/README.md` (status rows — mark 041 DONE; ensure 036–040 rows accurate)

**Out of scope**:

- Home page pricing CTA / hero changes for Pro.
- Implementing `?next=` redirect on signup/login (unless tiny allowlist pulled
  in deliberately — default is **don't**).
- Stripe schema/webhook changes.
- Enabling Free limit flags in production.
- Team workspace implementation (copy only: “coming soon”).

## Git workflow

- Work on `main`. Commit e.g.
  `Add /pricing page, nav links, and Stripe privacy copy`.
- Run `pnpm generate-routes` with the new route.
- Do NOT push unless instructed.

## STOP conditions

Stop and report if:

- 037 missing and you cannot implement signed-in checkout without inventing
  a new API — still ship marketing page + logged-out CTAs, but STOP before
  inventing a second checkout path.
- `NavPage` type is shared in a way that breaks many call sites without a
  clear extend — fix by adding `"pricing"` to the union and updating
  `createFileRoute` pages' `current=` props as needed.
- Tempted to add a home hero “Upgrade” button — **forbidden in v1**.
- Tempted to leave privacy “no third parties” as-is.

## Steps

### Step 1: Extend nav chrome

In `SiteHeader.tsx`:

1. Add `"pricing"` to `NavPage`.
2. Add a public nav `Link` to `/pricing` with `aria-current` when
   `current === "pricing"` (place near Privacy/Support — e.g. after Support or
   before GitHub).

In `SiteFooter.tsx`:

- Add `<Link to="/pricing">Pricing</Link>` next to Privacy.

Any page that exhaustively switches on `NavPage` must compile after the union
change (TypeScript will flag).

### Step 2: `/pricing` page

New `src/routes/pricing.tsx`:

- `createFileRoute("/pricing")` with loader `getSessionUser()` (optional session
  for CTA branching).
- `MarketingShell current="pricing"` + account when signed in.
- Design language: reuse `.feature-grid` / `.panel` / `.btn--primary` / eyebrow
  + lede from home / globals.

Content structure:

1. Eyebrow “Pricing” / H1 “Optional dashboard plans”
2. Lead: “The Mend extension is free and open source. Plans apply only to the
   optional cloud dashboard.”
3. Monthly / Yearly toggle — **default yearly**
4. Two cards Free | Pro (highlight Pro) + muted Team “coming soon”
5. Free card limits (product table):
   - Extension full (always)
   - Dashboard: 30-day retention, 200 saved audits, 3 API keys, 60 ingest/min
     (note these Free tightenings apply when the product Free tier is enforced —
     do not promise unlimited free storage)
6. Pro card: **$9/mo or $90/yr**, 2-year retention, 50_000 audits, 20 keys,
   300/min, Customer Portal
7. CTAs:
   - Free → `/signup` or `/dashboard` if signed in
   - Pro logged-out → `/signup` + visible “Create a free account, then return
     here to upgrade.” (**no** `?next=` unless allowlist implemented)
   - Pro signed-in free → `startCheckout` (`pro_monthly` / `pro_yearly` from
     toggle) with `credentials: "include"`
   - Pro signed-in already entitled → “Manage on Account” → `/account`
8. FAQ: cancel anytime via portal; extension stays free; JSON export; retention
9. Hide/disable paid CTAs when billing is not configured — optional client
   probe is hard without an endpoint; acceptable approaches:
   - always show Upgrade and let checkout return 503 with error message, or
   - pass `billingEnabled` from a tiny server loader/helper if easy

```bash
pnpm generate-routes
```

Copy constraints:

- Never “Mend Pro unlocks accessibility scanning”
- Prefer “Pro dashboard” / “Pro cloud sync”
- Footer still “Free and open source” for the **extension**

### Step 3: Privacy updates

In `src/routes/privacy.tsx`, replace the absolute third-parties claim
(lines 94–95 area):

**Required:**

1. **Payments:** If you purchase Pro, payment is processed by **Stripe**. We
   store Stripe customer/subscription IDs and plan status. Card numbers never
   hit Mend servers (Hosted Checkout).
2. **Data shared with Stripe:** email, name, payment details you submit to
   Stripe; subscription metadata (internal user id).
3. **Account deletion:** Deletes Mend-stored data and cancels Stripe
   subscription / removes customer where applicable.
4. Keep extension default: analysis on-device until sync (or paid dashboard use).

**Optional honesty pass (same unit):** mention optional Google/GitHub OAuth and
transactional email (Resend when configured). Do not block on a full legal
rewrite.

Update effective date via existing `site.privacyEffectiveDate` /
`VITE_PRIVACY_EFFECTIVE_DATE` when shipping if ops wants a new date.

### Step 4: Optional README one-liner

If README still implies the dashboard is free-only forever, add a short note
that an optional Pro dashboard plan exists — without diluting “extension free.”

### Step 5: Verify no home CTA

Grep `src/routes/index.tsx` for pricing/upgrade/checkout — must remain free of
Pro CTAs.

### Step 6: Full CI

`pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Test plan

- Typecheck covers `NavPage` exhaustiveness.
- Optional: component/smoke test not required if marketing page is static;
  prefer lint + typecheck + build.
- Manual: open `/pricing`, toggle yearly default shows $90, logged-out Pro goes
  to signup, signed-in Free starts checkout when Stripe test env set.

## Done criteria

- [ ] `/pricing` route with Free / Pro / Team coming soon
- [ ] Monthly/yearly toggle defaults to yearly ($9 / $90)
- [ ] Logged-out Pro CTA → `/signup` without relying on `?next=`
- [ ] SiteHeader + SiteFooter Pricing links; `NavPage` includes `"pricing"`
- [ ] privacy.tsx documents Stripe; absolute “no third parties” removed
- [ ] **No** home-page pricing CTA
- [ ] `pnpm generate-routes` run; full CI green
- [ ] Founder numbers appear correctly on the page
- [ ] No files outside scope
- [ ] `plans/README.md` status row for 041 → DONE (and billing generation notes
      already present from this planning commit)

## Maintenance notes

- Phase C: after this page + account CTAs ship, Free limits may be enforced
  (`FREE_LIMITS_ENFORCED=true`) — keep pricing Free card honest.
- Signup `next` allowlist is a future unit if UX demands return-to-pricing.
- Design reference: `plans/pricing-stripe-design.md` §§ `/pricing`, Nav/footer,
  Privacy, Rollout phase B.

When done, update `plans/README.md` status row to DONE.
