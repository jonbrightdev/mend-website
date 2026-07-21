# Implementation Plans

Four audit generations share this directory, with monotonic numbering, plus a
billing design generation:

- **001–008** — an `improve-animations` audit at commit `b5deaa1` (2026-07-16). All landed in commit `dbd4669`.
- **009–015** — an `improve` (general) audit at commit `dbd4669` (2026-07-16).
- **016–022** — a second `improve-animations` audit at commit `88d2ab8` (2026-07-17), this one **additive**. The 001–008 generation was corrective: it fixed motion that already existed, and re-checking it at `88d2ab8` found its work intact and almost nothing left to correct. But a corrective audit can only ever fix what is already animating — it never asks what *should* animate. This generation answers that. The home page had exactly one animation (the hero panel's drift); no page revealed anything on scroll.
- **023–027** — planned at commit `cb1bec2` (2026-07-17), not from a fresh audit: these are the five "Direction ideas surfaced but not planned" from the 009–015 generation, promoted to full plans now that everything they waited on has landed.
- **028–034** — an `improve` (general) audit at commit `0be29dc` (2026-07-18), the second full-repo pass. Baseline at audit time: typecheck clean, 216 tests green. The headline finding is 028 (OAuth-only users cannot delete their account — the danger zone demands a password they don't have); the rest is small hardening (029, 030), a doc correction with history behind it (031), toolchain and test-layer additions (032, 033), and one promoted direction idea (034).
- **035** — extension key postMessage handoff (website half), planned at `b6e5be3` (2026-07-18); DONE at `a0f7690`.
- **036–041** — **billing / Stripe** generation from design doc
  [`pricing-stripe-design.md`](pricing-stripe-design.md), planned at commit
  `a0f7690` (2026-07-19). Monetizes the optional cloud dashboard only (Free vs
  Pro; Team deferred). Founder-approved: Pro **$9/mo · $90/yr**; Free when
  enforced **30-day retention · 200 audit cap · 3 API keys · 60 rpm**; Pro
  **2y · 50k · 20 keys · 300 rpm**. Extension stays free/offline always; no
  home-page pricing CTA in v1. Algorithms and rollout gates live in the design
  doc — plans are executor units, not a second design.
- **042–046** — **user-requested features**, planned at commit `a0f7690`
  (2026-07-19). One small fix (042: the dashboard "Connect extension" CTA
  shows only while no active API key exists) and two features: **monitoring**
  (043 schema + `/monitors` UI → 044 headless-Chromium/axe scan engine →
  045 in-process daily scheduler at a random UTC time — inspired by
  har-analyzer's monitors, deliberately without its Redis/BullMQ worker) and
  an on-demand **VPAT 2.5-format ACR** (046, WCAG 2.2 A/AA, automated-
  assessment framing is a hard requirement). Monitor runs write ordinary
  `audit`/`violation` rows, so the dashboard, export, and the VPAT report
  consume them with zero coupling.
- **047** — signup → account extension handoff, planned at `a0f7690`
  (2026-07-19): with `from=extension`, signup lands on `/account` so the
  plan-035 key postMessage completes the extension funnel. Website half of
  `../mend-a11y/plans/008-account-signup-prompt.md`; either half can land
  first. (Renumbered 2026-07-19 from a file that collided with 042.)
- **048–050** — **documentation** generation, planned at commit `9281534`
  (2026-07-20), founder-requested: useful docs on the site, inspired by
  Level Access's LLM-resources approach (human- *and* LLM-legible).
  048 builds the `/docs` section + curated `public/llms.txt`; 049 is the
  "VPATs and ACRs" guide (the request said "VPATs and MCR" — **MCR is not
  an industry term**; research found only the VPAT/ACR pairing, so 049
  assumes a slip for ACR and STOPs if the founder means otherwise); 050 is
  "accessibility laws and legal compliance" (ADA/508/EAA/EN 301 549/UK +
  brief others), with execution-time fact verification against primary
  sources and a not-legal-advice disclaimer as hard requirements. Both
  guides carry the 046 honesty stance: no copy may imply automated
  testing alone yields compliance or a conformance claim.

- **051–057** — an `improve` (general) audit at commit `9930443`
  (2026-07-21), the third full-repo pass. Baseline at audit time: typecheck
  and lint clean, 528 tests green. Four parallel category agents, findings
  vetted against the code before planning. The headline is **051** (the
  monitor scanner's SSRF guard runs once and Chromium then follows redirects
  past it — a *different* gap from the DNS-rebinding one `url-guard.ts`
  documents as accepted); the rest is a perf bound that account age was
  slowly breaking (053), two dedup/tooling items (052, 054, 055), and two
  plans on the **manual-audit surface** (056, 057) that carry a prerequisite:
  that feature was not on `main` when these were written. See the note below.

### The manual-audit prerequisite (056, 057)

During this session, an `git add -A` in commit `241b933` swept the
then-uncommitted `/api/manual/**` feature (5 tables, migration `0005`, 7
routes, `manual-audit.ts` — 2,376 lines) into a commit whose message was
about closing plan 044's deploy gate, and pushed it. That was an error, and
the history was split back out: `main` was rebuilt as `e91c4a2 → 33c69c7 →
a744473 → 9930443`, and the feature returned to the working tree
uncommitted. The old tip is preserved at branch `backup/pre-split`.

Three independent signals said the feature was mid-build, not finished: it
had no tests at all, `screenshots.$key.ts` documents its own missing
authorization as provisional ("for now"), and **nothing anywhere sets
`user.isAuditor`** — it is only ever read, so the routes are unreachable
without a manual database edit.

**Two of those have since moved**, in the working tree, after the audit ran:
a route-level suite now exists at `src/routes/api/manual/manual.test.ts`
(auth rejection, revoked keys, cross-auditor audit isolation, check/finding
interaction, screenshot storage, dismissal validation), and `vite.config.ts`
gained `optimizeDeps: { exclude: ["fsevents"] }` — which looks like the fix
for the `pnpm dev` breakage that five previous plans worked around. Plans 056
and 057 were revised to build on that suite rather than duplicate it. The
`isAuditor` grant path is still absent, and the screenshot ownership gap is
still open and still untested — that is precisely what 056 closes.

**One consequence to remember**: Railway ran `db:migrate` on the bad push, so
production *has* migration `0005` applied while `main` no longer contains it.
When the feature is re-landed, **commit the existing `drizzle/0005_*` files
with it** rather than regenerating — a fresh migration would try to
`CREATE TABLE` tables that already exist in production.

Each plan is self-contained — an executor needs no other context. Read the plan fully before starting, honor its STOP conditions, and update your status row when done.

## Execution order & status

Completed plans are removed once done. Generations 001–027 are fully landed;
the last five were 023–027 (email verification, ingest rate limit, JSON
export, rule-catalogue expansion, shared ingest contract), all DONE as of
commit `0be29dc`. Earlier milestones: 012 (indexed `violation.auditId`,
migration `0002_nostalgic_bruce_banner.sql`), 014 (account-page danger zone),
015 (the `getDashboardData` rewrite).

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| [028](028-oauth-account-deletion.md) | Let OAuth-only users delete their account | P1 | M | — | DONE (plus an unplanned fix it surfaced: `account-fns` plain db exports moved to `account-queries.ts` so the server-only import protection from `2e8f629` passes — the build was broken at that baseline) |
| [029](029-ingest-500-cors.md) | CORS-visible JSON errors on ingest failure | P1 | S | — | DONE (500 catch-all around the storage transaction; contract synced to `../mend-a11y` working tree, not committed there) |
| [030](030-ingest-body-cap-and-write-order.md) | Early body-size gate + lastUsedAt after rate limit | P2 | S | 029 | DONE (Content-Length fast-path 413 before buffering; `lastUsedAt` touch deferred to after the limiter so rate-limited requests cost one indexed SELECT, no write) |
| [031](031-retire-db-push-from-docs.md) | Docs bootstrap with db:migrate, not db:push | P2 | S | — | DONE (README + .env.example + src/db/index.ts point at db:migrate; also updated a second db:push mention the plan didn't document — the PGlite concurrency warning in src/db/index.ts — to db:migrate, so the done-criteria grep passes) |
| [032](032-lint-gate.md) | Add a Biome lint gate to the toolchain and CI | P2 | M | — | DONE (Biome 2.5.4, formatter off, `pnpm lint` after typecheck in CI + CLAUDE.md. Fixed: 3 decorative SVGs got `aria-hidden`, 2 string concats → template literals. Suppressed inline: `noAssignInExpressions` on the db memoization line. Disabled rules — `style/noNonNullAssertion` (deliberate bounds-guaranteed `!`), `complexity/noImportantStyles` + `style/noDescendingSpecificity` (deliberate a11y CSS `!important` / cascade order), `suspicious/noArrayIndexKey` (stable/static lists), and **`a11y/useSemanticElements` + `a11y/useAriaPropsSupportedByRole`** — the last two are real a11y signals on `role="group"` containers and `aria-label` on generic-role spans; fixing them is behavioral (out of scope here) so they were disabled — **worth a dedicated a11y follow-up plan to re-enable and fix**. **Both re-enabled 2026-07-21**, all 6 violations fixed rather than suppressed: two were real silent failures — `aria-label` on a bare `<span>`/`<div>` (the `generic` role does not support naming, so AT dropped the label), fixed with `role="img"` on the dashboard's `MiniImpacts` cluster and `<figure>` on the rule-detail codeflip; three `role="group"` containers became real `<fieldset>`s; and the dashboard's outer `toolbar__group` lost a redundant nested group that made a screen reader announce "Dashboard layout" then "Layout" for one pair of buttons. The fieldset swap needed a UA-default reset — `min-inline-size: min-content` is the sharp edge, since it stops a flex row shrinking — verified in headless Chromium by rendering both element choices against the real CSS: 183x46 and 437x38, identical either way.) |
| [033](033-component-test-layer.md) | Component-test layer for dashboard + account | P3 | M | 028, 032 | DONE (jsdom + Testing Library, opt-in per file via `// @vitest-environment jsdom`; 11 new tests — 5 DashboardClient, 6 AccountClient incl. the OAuth-only deletion branch. RTL auto-cleanup needs a global `afterEach` this repo doesn't enable, so each file registers `afterEach(cleanup)` itself; jest-dom matchers via the `/vitest` subpath.) |
| [034](034-detail-page-trend.md) | Per-page violation trend on the detail page | P3 | M | — | DONE (`getAuditRecord` → `{ record, trend }` with day-bucketed per-page TrendPoints; `TrendChart` extracted verbatim to `src/components/TrendChart.tsx`; detail page renders "This page over time" when ≥2 run days; 6 new query tests. Note: `$auditId/index.tsx` had gained a zero-violation empty state since plan time — it destructures only `user`/`audit` from `fetchAudit`, so the added `trend` field passed through untouched) |
| [035](035-extension-key-postmessage.md) | Broadcast the generated API key to the extension via postMessage | P3 | S | — | DONE (`onGenerate` posts `{ source: "mend-website", type: "MEND_API_KEY", apiKey }` to `window.location.origin` right after `setFreshKey`; test spies on `window.postMessage` directly rather than listening for the "message" event — jsdom 29 always reports `origin: ""` on a same-window `MessageEvent`, confirmed with a standalone repro, so the event-listener approach in the plan can't check the target-origin argument) |
| [036](036-billing-schema-entitlements.md) | Billing schema + pure entitlements core | P1 | M | — | DONE (`user.stripeCustomerId` + `subscription` + `stripe_event` via migration `0003_ordinary_expediter.sql`; pure `entitlements.ts` + server `billing-queries.ts`; 16 new tests. Additive migration only — no Stripe package, no enforcement. `.env.example` gains Stripe + launch-gate vars, both flags default false) |
| [037](037-stripe-checkout-portal.md) | Stripe SDK + Checkout + Customer Portal routes | P1 | M | 036 | DONE (`stripe@22.3.2`, apiVersion pinned to the package's own `2026-06-24.dahlia`; `src/lib/stripe.ts` server-only + `billing-config.ts` pure env helpers; POST `/api/billing/checkout` and `/portal` with session auth, Drizzle-loaded customer id, race-safe conditional customer create, 409 `ALREADY_SUBSCRIBED` via `effectivePlan`, 503 when unconfigured, `allow_promotion_codes: true`; 10 route tests with Stripe+session mocked. Two implementation notes: update `.returning()` takes no field arg in this drizzle version — read the full row; route/mock test files must import anything touching `@/db` dynamically in `beforeAll` or `@/db` memoizes the persisted `./.data/pglite` before `createTestDb`) |
| [038](038-stripe-webhooks-delete-cleanup.md) | Stripe webhooks + beforeDelete cleanup | P1 | L | 036, 037 | DONE (webhook pipeline exactly per design: raw-body verify, event pre-check, all Stripe retrieves via `prepareSubscriptionMirror` before the TX, short TX for `stripe_event` + upsert, 23505 → 200, apply throw → rollback + 500 with no event row. `beforeDelete` → exported `cleanupStripeBeforeDelete`, fail-closed, cancels all non-terminal subs then deletes the customer. One integration gotcha: `@/lib/stripe` constructs its client at import time and throws without `STRIPE_SECRET_KEY`, and `auth.ts` is imported by nearly every server module/test — so `cleanupStripeBeforeDelete` loads it via dynamic `import()` on the paid path only; a top-level import broke 3 unrelated suites — resolved with a lazy Proxy in `stripe.ts` that builds the client on first property access). Follow-up fix in the same session: the route's 23505 handler was a catch-all, so a unique violation from the *subscription* upsert (its `subscription_user_uidx` / `stripeSubscriptionId` indexes — which collide for real when `checkout.session.completed` and `customer.subscription.created` race to create a user's first mirror row) was misread as "event already processed" → 200 → no Stripe retry → silently lost update. Narrowed to `isDuplicateEventInsert`, which matches only `cause.table === "stripe_event"` / `stripe_event_pkey`; everything else 500s so Stripe retries. Regression test covers it |
| [039](039-enforce-plan-limits.md) | Enforce Free/Pro limits (env-gated) | P1 | M | 036 | DONE (dual limiters built from `PLAN_LIMITS` rather than literals so the ceilings can't drift; existence check before cap, so a duplicate at cap is still 200; `403 AUDIT_CAP` with plan-appropriate copy through the CORS `json()` helper; new `retention.ts` behind two gates — `RETENTION_PURGE_ENABLED=true` *and* a finite window — plus a once-per-24h-per-user in-process throttle, called after a successful non-duplicate write and wrapped in try/catch so a purge failure can never fail an ingest that already committed; `assertKeyQuota` now reads entitlements, `MAX_ACTIVE_KEYS` re-exports `PLAN_LIMITS.pro.maxActiveApiKeys`. 21 new tests. Three notes: (1) `.returning()` takes no field selection in this drizzle version — same gotcha as 037; (2) `CONTRACT_VERSION` deliberately **not** bumped — the protocol bumps on payload-shape changes and every previously-accepted payload still parses identically, reasoning recorded in `contract/README.md` itself; the README was re-copied to `../mend-a11y/test/contract` (`diff -r` clean, not committed there, same as 029); (3) one line outside the plan's stated scope — `.env.example` documents the optional `RETENTION_PURGE_DRY_RUN` the plan's step 3 introduced, rather than shipping an undocumented env var. **Production flags untouched: both remain false.**) |
| [040](040-account-billing-ui.md) | Account billing UI + success/cancel pages | P1 | M | 037, 038 | DONE (`getBillingSummary` in billing-queries + `getKeyQuota` in account-queries feed a widened `fetchAccount`; new `BillingPanel.tsx` above the extension panel — effective-plan badge, past_due card warning, cancels-on copy, yearly-default interval chooser, portal button, all `credentials: "include"`; Generate now surfaces the server's own quota message and disables at cap with an "N of max" hint in the panel head; `/billing/success` + `/billing/cancel` added and routes generated. 27 new tests. Four notes: (1) the success page reuses `fetchAccount` rather than a new loader fn — it already returns the billing DTO and already redirects to /login, so no second server fn was needed and the DB stays the only source of truth (no `session_id` retrieve); (2) `canManage` is gated on `billingEnabled` too — a user can hold a `stripeCustomerId` while Stripe is unconfigured, and the portal route would 503; (3) the cap is recomputed from the key list each server fn returns, not from the loader's `keyQuota.active`, so revoking re-enables Generate without a reload — `keyQuota.max` is the only field read from the loader; (4) checkout/portal fetch tests resolve `ok: false` deliberately — jsdom cannot perform the `window.location.href` navigation, and the assertion is about the request, not the redirect) |
| [041](041-pricing-page-privacy.md) | Public `/pricing` + nav/footer + privacy | P1 | M | 037 | DONE (new `fetchPricing` server fn — like `fetchAccount` but never redirects, returning `{ user, billing: null-when-signed-out, billingEnabled }`; `/pricing` renders Free / Pro / Team-coming-soon off a yearly-default radio fieldset, with CTAs branching signed-out → `/signup` + the "create a free account, then return here" note, signed-in Free → `startCheckout`, already-Pro → `/account`. Privacy's absolute "no third parties" claim replaced by a Third-parties section with Payments / Sign-in and email / Hosting / Deleting-your-account subsections. Four notes: (1) the checkout `fetch` is duplicated from `BillingPanel.tsx` rather than extracted — `BillingPanel` is outside this plan's scope, so a shared `billing-client` helper is left as a follow-up; (2) no component test — the page reads `Route.useLoaderData()`, so testing the CTA branches would mean extracting a presentational component, and the plan's test plan calls a smoke test optional; typecheck/lint/build cover it, and SSR output was verified by fetching `/pricing` from the dev server (yearly default renders $90, logged-out Pro CTA → `/signup`, `billingEnabled:false` shows the "checkout is not open yet" note); (3) verification was HTML-level only — Playwright is not installed in this repo and adding it for one screenshot wasn't worth the dependency, so the three-column grid is reasoned from the reused card/`--r-lg`/shadow tokens, not observed; (4) `site.privacyEffectiveDate` left alone — it is env-driven (`VITE_PRIVACY_EFFECTIVE_DATE`, currently the `[DATE]` placeholder) and the plan makes bumping it an ops call, **but this policy materially changed, so ops should set it before paid launch**) |
| [042](042-connect-extension-cta-visibility.md) | Hide the dashboard "Connect extension" CTA once a key exists | P2 | S | — | DONE (`hasActiveKey` LIMIT-1 existence check in `account-queries`, run in `Promise.all` with `getDashboardData` so the loader gains no round trip; threaded through `fetchDashboard` → route → `DashboardClient`, CTA wrapped in `{!hasActiveKey && …}`; `EmptyState` untouched per scope. 6 new tests (2 component, 4 query). One note: the plan pointed at "the file that tests `listKeysFor`" — no such file exists (`listKeysFor` is only covered indirectly), so the query cases went in `account-fns.test.ts` beside `assertKeyQuota`/`userHasPassword`, which is where `account-queries` is tested. That file seeds users with bare `u-*` ids in a shared db across describe blocks, so the new fixtures are namespaced `hak-*` to avoid `user_pkey` collisions) |
| [043](043-monitor-schema-and-ui.md) | Monitored pages: schema, queries, `/monitors` UI | P1 | M | — | DONE (`monitor` table via migration `0004_crazy_moira_mactaggert.sql`, additive only; pure `monitor-schedule.ts` + server-only `monitor-queries.ts` + `monitor-fns.ts`; `/monitors` route, `MonitorsClient`, nav entry between Dashboard and Account. 31 new tests (6 schedule, 16 query, 9 component); no new CSS — `panel`/`table.data`/`field`/`btn` covered it. Two notes: (1) **`MAX_MONITORS` is sent in the loader payload, not re-exported from `monitor-fns`** — a *value* re-export from `monitor-queries` isn't erased like `export type` is, so it survived into the client bundle and failed the server-only import protection at `pnpm build` (typecheck/lint/test were all green first); sending it also means plan 039 can make the cap plan-aware without touching the component; (2) the "newest first" query test pins `createdAt` explicitly — `defaultNow()` handed both inserts the same instant, leaving the `desc(createdAt)` sort genuinely ambiguous. Signed-out `/monitors` verified 307 → `/login` against the dev server; signed-in rendering is covered by the component tests, not observed in a browser) |
| [044](044-monitor-scan-engine.md) | Server-side scan engine (headless Chromium + axe) + Run now | P1 | L | 043 | DONE **except the production deploy check** (`playwright-core@1.61.1` + `axe-core@4.12.1`, nitro pin verified byte-identical after install; `audit-store.ts` extracted and the ingest route delegates to it with all 49 pre-existing ingest tests passing unmodified; `scan/url-guard.ts`, `scan/normalize.ts`, `scan/scanner.ts`, `run-monitor.ts`, Run now in fn + UI, `nixpacks.toml`. 61 new tests. Verified with real Chromium against W3C's "before" demo page: 7 rules / 67 nodes incl. `color-contrast` — the rule jsdom would have silently dropped, which is the whole reason for the real-browser decision — read back through `getDashboardData`, `lastError` null, `nextRunAt` rolled to tomorrow. Four notes: (1) **selector joins with `" > "`, not the plan's `join(" ")`** — the plan's own rationale says mirror the extension, and the extension uses `" > "`; the dashboard shows selectors from both scanners in one table, so they must agree; (2) `runMonitor` returns `{ok, error}` rather than the planned `Promise<void>` — an unreachable page is a *result*, not an exception, and Run now needs it to surface; it never throws for a scan failure so one bad page can't abort plan 045's batch; (3) the IPv6 guard needed a hex branch — WHATWG `URL` rewrites `::ffff:127.0.0.1` to `::ffff:7f00:1`, so the dotted-quad regex alone let mapped loopback through; (4) `scanFixtureForTest` exports the browser work without the SSRF guard **for the e2e test only** — it scans a 127.0.0.1 fixture server, which `scanPage` refuses by design. axe inlines to ~550 kB in the server bundle and was confirmed absent from the client bundle. **Deploy gate still open**: `nixpacks.toml` adds Chromium to the Railway image and only a production Run now proves the launch works — until then the feature is safe-but-inert there (a launch failure lands in `lastError`). First production Run now (2026-07-20) surfaced exactly the launch failure this gate was written for: `browserType.launch: Failed to launch chromium because executable doesn't exist at chromium`. Root cause was in the code, not Nixpacks — Playwright's launch check is a plain `fs.access` on `executablePath`, not a shell-style PATH search, so `chromiumPath()`'s bare `"chromium"` fallback resolved against `process.cwd()` and never matched the Nixpacks-installed binary. Fixed in `2cf174a`: `chromiumPath()` now walks `PATH` itself and caches the resolved absolute path; 3 new unit tests in `scanner.test.ts` lock in the resolution. Pushed to main; **gate CLOSED 2026-07-21** — a production Run now against `https://mend-a11y.com/` completed with no error, `nextRunAt` rolled to tomorrow, and the audit was read back on the dashboard (0 violations), confirming the run stored rather than merely reporting success. The PATH-walking `chromiumPath()` works on the Nixpacks image; `CHROMIUM_PATH` did not need to be set. **044 is fully DONE.** Two findings from the same check, neither blocking: (1) the other monitor, `https://doxy.me/`, carries `page.goto: Page crashed` — a *post-launch* failure, so it does not reopen this gate, but a real limitation worth its own plan (a heavy video-conferencing SPA in a memory-constrained Railway container is a plausible OOM). It also confirms 044's error contract holding as designed: the crash landed in `lastError` rather than throwing, so it cannot abort a scheduler batch; (2) the operator double-clicked Run now — `RUN_NOW_COOLDOWN_MS` (10 min) bounds this to at most one duplicate scan, and only if the first click reached the server before `lastRunAt` was written; no cooldown error was shown, so most likely only one scan ran) |
| [045](045-monitor-scheduler.md) | In-process daily scheduler (random UTC time per day) | P1 | M | 043, 044 | DONE (`claimDueMonitors` atomic claim-then-run + `monitor-ticker.ts` + nitro boot plugin registered via `plugins: [...]` in `vite.config.ts`. 20 new tests. **The plan's one unknown resolved: the pinned nitro nightly does honour runtime plugins** — it exports `definePlugin` (aliased from `defineNitroPlugin`) at the package root, config takes `plugins: string[]`, and `nitro.hooks.hook("close", …)` exists, so `stop()` is wired to shutdown; verified on the *built* server, where the log appears exactly once with `MONITOR_SCHEDULER_ENABLED=true` and not at all without it. srcDir auto-scanning is off in this setup, hence explicit registration. Full loop verified end-to-end against W3C's demo page: tick → claim → real Chromium scan → `getDashboardData` shows the audit → `nextRunAt` rolled to tomorrow → second tick correctly claimed nothing. Two notes: (1) `.returning()` field selection is still unsupported in this drizzle version (same gotcha as 037/039) — the claim reads the full row and narrows in JS; (2) `MonitorTarget` moved from `run-monitor.ts` to `monitor-queries.ts` (the data layer owns the row shape) and is re-exported from its old home, so 044's imports are unaffected. **Railway flag NOT flipped** — `MONITOR_SCHEDULER_ENABLED` stays unset until 044's Chromium deploy is verified, per the plan's phasing. Nothing pushed) |
| [046](046-vpat-report.md) | On-demand VPAT-format conformance report | P2 | L | — | DONE (`wcag-criteria.ts` catalogue + `vpat-data.ts` determination + `vpat-render.ts` standalone HTML + `vpat-fns.ts`, `/vpat` preview, `GET /api/vpat` download, entry links on the dashboard app-head and a new account "Reports" panel. 26 new tests. **Catalogue verified against https://www.w3.org/TR/WCAG22/ at execution time, not from memory** — the page was fetched and every "Success Criterion" section parsed for its own conformance-level marker, giving exactly the plan's counts (A: 31, AA: 24). Worth recording the parsing trap: 4.1.1 Parsing carries *no* conformance-level marker at all (it is "Obsolete and removed"), so a naive regex spanning from one heading to the next level marker silently hands 4.1.1 the level belonging to 4.1.2 and drops 4.1.2 from the list entirely — the first extraction did exactly that and produced a plausible-looking A:31 that was wrong by two rows. Splitting per-section first is what makes the counts trustworthy. Four notes: (1) `buildVpatData` takes the product name but applies the hostname fallback *itself*, after loading pages — the default can't be computed before the data exists, and doing it inside means the route and the preview cannot disagree; (2) a rule failing several criteria (e.g. `label` → 1.3.1 *and* 4.1.2) counts in full under each, since these are per-criterion remarks rather than a partitioned total; (3) `/vpat` gets no nav entry per the plan and passes `current="dashboard"`, matching how the audit detail pages sit under the dashboard; (4) **adding `<Link>` to `AccountClient` broke its 19 existing tests** — that suite renders without router context, so it needed the same Link mock `DashboardClient.test.tsx` already uses; the fix is in the test file, the component is unchanged in spirit. Verified end-to-end by rendering a real two-page fixture through the actual builder and renderer: image-alt on both pages → Does Not Support, color-contrast on one → Partially Supports, an untagged `heading-order` → appendix, 12.5 kB, zero `src=`/`href=` in the whole document, and print-to-PDF confirmed in headless Chromium. `pnpm dev` could not be used — it dies on an unrelated fsevents native-binding load under rolldown on this machine — so the guards were checked against the *built* server: signed-out `/vpat` → 307 `/login`, `/api/vpat` → 401 JSON, and the client bundle carries the link with no drizzle/`buildVpatData` leak. Nothing pushed) |
| [047](047-signup-extension-handoff.md) | Route extension-driven signups to /account | P2 | S-M | — | DONE (`validateSearch` on /signup, /login, /account; `fromExtension` threaded into both auth forms and `AccountClient`; "One step left" callout + focus-on-section + the extension-pickup sentence in the key reveal. 14 new tests. Four notes: (1) **the validator was extracted to `src/lib/auth-search.ts`** rather than inlined three times — the plan's step-4 case 3 asks for a test of the normalization, and the route modules pull in server-only code, so a pure module is the only way to test it directly; the three routes now share one `validateAuthSearch`; (2) the plan's STOP on "no precedent for a redirect carrying search" was considered and **not** triggered — `redirect({ to, search })` and `<Link search={…}>` are the same typed API `reset-password.tsx` already uses `validateSearch` from, and `pnpm typecheck` confirms both compile, including every pre-existing bare `<Link to="/login">` elsewhere in the app; (3) `SignupForm`/`LoginForm` had **no** test files at all despite the plan assuming they did — new `SignupForm.test.tsx`/`LoginForm.test.tsx` mock `authClient`, `auth-features` (all three methods on), and a `Link` stand-in that renders `search` (AccountClient's existing stand-in drops it, which is exactly what these assert on); jsdom can't navigate, so `window.location` is replaced with a recording stand-in to read back the email-flow destination; (4) **manual checks 4 and 5 verified in real Chromium** against the built server — footer link is `/login?from=extension` with the flag and `/login` without, `from=evil` and `from=https://evil.example` both normalize away, and the click-through lands on `/login?from=extension` — but **checks 1–3 could not be run locally**: signup dies at `42703 column "stripeCustomerId" does not exist`, the known-stale local PGlite, so the authed-`/signup`→`/account` redirect and the on-page callout/focus are covered by typecheck and component tests, not observed end-to-end. Nothing pushed) |
| [048](048-docs-foundation.md) | Docs section foundation (`/docs` + llms.txt) | P2 | M | — | DONE (`DocsArticle.tsx`, `/docs` index, Docs in header nav between Home and Pricing + footer, `public/llms.txt`. **No new CSS** — `page-head`/`section--tight`/`feature-grid`/`feature`/`chip`/`muted` covered it. Neither guide has landed, so both index entries render unlinked with a "Coming soon" chip, and `llms.txt` lists only the `/docs` index under `## Docs`, per the plan's landed-check. Four notes: (1) **the plan's STOP on the production origin fired** — no origin exists anywhere in the repo (`BETTER_AUTH_URL` is localhost, `railway.json` has no domain); the operator supplied `https://mend-a11y.com`. Related: `src/lib/scan/scanner.ts:31` hardcodes `https://mend.dev/support` in the monitor user-agent, which now looks like a **wrong domain** — out of scope here, worth a one-line fix (**done 2026-07-21**: now `https://mend-a11y.com/support`); (2) done criterion "DocsArticle is exercised by the index or a landed article" **cannot be met as written** — the index has its own head/card layout and neither article exists, so `DocsArticle` would ship unexercised; covered instead by `DocsArticle.test.tsx` (3 tests: h1 level, eyebrow/lede/last-reviewed, back link), using the same jsdom + Link-mock idiom as `DashboardClient.test.tsx`; (3) monitoring is deliberately **absent** from the llms.txt blockquote even though 043–045 landed — 044's production Chromium gate is still open, so an LLM-facing claim about it isn't verifiable yet; the blockquote sticks to claims checked against live copy (free/MIT, Chrome, WCAG 2.0/2.1/2.2, on-device with no network requests, optional dashboard for history + VPAT reports), and axe-core was verified as a real dependency of *both* repos; (4) verified against the **built** server, not `pnpm dev` (still dies on the fsevents/rolldown native-binding load on this machine, same as 046/047): `/llms.txt` 200 `text/plain`, all five URLs in it resolve 200, `aria-current="page"` lands on Docs on `/docs` and is absent on `/support`. Nav is plain anchors, so keyboard behaviour is structural rather than separately observed) |
| [049](049-docs-vpat-acr.md) | Docs guide: VPATs and ACRs | P2 | M | 048 | DONE (`/docs/vpats-and-acrs` via `DocsArticle`; 8 h2 sections + 5-entry native-`<details>` FAQ, index entry linked, llms.txt line replaced with a real description. No new CSS or components — `prose`/`callout`/`faq`/`section--tight` covered it. **Step 1 facts verified live against ITI and Section508.gov, and the plan was wrong twice**: (1) the current template is **VPAT 2.5Rev (April 2025)**, not "2.5" — the guide says 2.5Rev; (2) ITI's own wording is "**registered service marks**", not "registered trademark", so the closing note says service mark. Everything else in the plan's outline held: four editions (508 / EU EN 301 549 / WCAG — currently WCAG 2.2 / INT), and the five conformance terms with *Not Evaluated* permitted only in the Level AAA table. Two facts the plan didn't have and the guide uses: remarks are **mandatory** for Partially Supports / Does Not Support and optional-but-encouraged for Supports (this is what makes the "wall of Supports with empty remarks" smell in section 4 a documented signal rather than an opinion), and Section508.gov states the VPAT template itself is not required while an ACR effectively is, to sell federally — which is the honest answer to the "legally required?" FAQ. Three notes: (1) **fixed an a11y bug 048 could not have surfaced** — `/docs` only just gained children, and TanStack `Link` fuzzy-matches parents, so the "← All guides" back link and the footer Docs link were both stamped `aria-current="page"` while on an article, i.e. a link pointing elsewhere claiming to be the current page; both now pass `activeOptions={{ exact: true }}`. The header keeps its explicit `current="docs"` section marking, matching how audit detail pages keep Dashboard lit. Verified: 1 `aria-current` on the article, 2 on `/docs` itself; (2) **`src/lib/vpat-render.ts:24` now disagrees with this guide** — it says "registered trademark" and "VPAT 2.5 WCAG edition"; per ITI both should read "registered service mark" and "2.5Rev". Out of scope here (046's file), worth a one-line follow-up so the site doesn't contradict itself (**done 2026-07-21**: `TRADEMARK_FOOTNOTE` and `REPORT_SUBTITLE` both corrected — the subtitle said "VPAT® 2.5 format" too, which the 049 note missed. Tests assert against the exported constants, not literals, so no test churn); (3) the cost FAQ deliberately quotes **no figures** — they age badly and the honest point is that evaluation, not paperwork, is the cost. No 050 cross-link yet (not landed); add both directions when it does. Verified against the built server again, not `pnpm dev`) |
| [050](050-docs-accessibility-laws.md) | Docs guide: accessibility laws and legal compliance | P2 | L | 048 | DONE (`/docs/accessibility-laws` via `DocsArticle`; 9 h2 sections with h3s only under United States, 6-entry `details` FAQ, index entry linked, llms.txt entry added, 049 cross-linked both ways. No new CSS or components. **Step 1 fact-checking found the plan's central US fact is now wrong**: a DOJ **interim final rule effective 20 April 2026** (FR 2026-07663) extended *both* ADA Title II web compliance dates by a year — 50k+ population moved 24 Apr 2026 → **26 Apr 2027**, and <50k plus special districts moved 26 Apr 2027 → **26 Apr 2028**. So the plan's instruction to say "one deadline has likely already passed" is false: **no ADA Title II web deadline has passed.** The guide states the current dates and adds a callout warning that anything written before April 2026 gives the old ones. Judged *not* a STOP: the STOP covers a change that reshapes §3's structure (its example is a codified Title III rule), and a deadline shift is exactly the kind of fact step 1 exists to catch. Three other corrections: (1) **EN 301 549 is still harmonised at v3.2.1, which references WCAG 2.1** — the WCAG 2.2 alignment (draft V4.1.0, Nov 2025) is not yet cited in the OJ, so the guide must not imply WCAG 2.2 applies in the EU; (2) Section 508's precise value is WCAG 2.0 **Level A and Level AA** (E205.4), not "2.0 AA"; (3) UK PSBAR at WCAG 2.2 AA and AODA at WCAG 2.0 AA both confirmed as planned. Four notes: (1) **three facts were omitted rather than hedged, per the plan's rule** — EAA transitional periods (the 2030/20-year provisions), Canada's "Digital Technologies Phase 1" effective dates, and the WCAG version in AHRC's *updated* Australian guidance; EUR-Lex full text answers a bot challenge (HTTP 202, empty body) from this environment and canada.ca/humanrights.gov.au returned 403, so the sections were written without them. The EAA's load-bearing 28 June 2025 application date **was** confirmed, from EC-hosted official pages (AccessibleEU + the EUR-Lex LEGISSUM summary) rather than the raw directive; (2) **monitoring is deliberately not mentioned in §8**, matching 048's llms.txt reasoning — 044's production Chromium gate is still open, so §8 claims only on-device auditing, stored history, and the VPAT report, all of which hold regardless; (3) **typecheck caught a latent bug in 048's index**: with `as const` and every entry finally carrying a real `href`, the unlinked fallback branch narrowed to `never` and stopped compiling — the "coming soon" pattern only type-checked while a guide was missing. `guides` is now an explicit `Guide[]` whose `href` is a union of landed routes plus `null`, so the pattern survives for future guides; (4) the FAQ gained a 6th entry the plan didn't list — "We got a demand letter. What now?" — answered as "talk to a lawyer first", which is the one question where general information is actively unsafe. Verified in **real headless Chromium** against the built server (`pnpm dev` still dies on the fsevents/rolldown native-binding load, same as 046–049) — and note the raw HTML carries no body markup for *any* page in this build, so grep-based checks are useless here and a browser is required: heading order clean with no skips, disclaimer callout bottom at 651px on an 800px-tall viewport (above the fold), 6 `details`, exactly one `aria-current` (the nav's Docs link — 049's `exact` fix holding), and every fact rendering as verified. Full gate green: 511 tests) |

### Generation 051–057 (planned at `9930443`, 2026-07-21)

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| [051](051-scan-redirect-guard.md) | Re-validate every redirect hop against the SSRF guard | P1 | M | — | TODO |
| [052](052-js-yaml-override.md) | Clear the js-yaml HIGH advisory with a pnpm override | P2 | S | — | TODO |
| [053](053-bound-audit-history-loads.md) | Bound the unbounded audit-history loads | P2 | M | — | TODO |
| [054](054-structured-logging.md) | Replace ad-hoc console calls with one structured logger | P3 | M | — | TODO |
| [055](055-shared-billing-and-session-helpers.md) | Extract the duplicated Checkout call and session guard | P3 | S | — | TODO |
| [056](056-manual-audit-auth-and-tests.md) | Close the screenshot authorization gap; test the manual-audit auth core | P1 | M | manual-audit feature landing | TODO |
| [057](057-manual-audit-queries-layer.md) | Move the manual-audit routes onto the queries layer | P3 | M | 056 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

## Dependency notes

### General generation (028–034)

- **029 before 030** — both edit `src/routes/api/ingest.ts`; 029's try/catch
  sits below the lines 030 restructures, and 030's drift check expects 029's
  diff to be present.
- **028 before 033** — 033 tests `AccountClient`, whose props and deletion
  branches 028 changes. 033's drift check tells the executor to read the live
  component either way.
- **032 anywhere, but earlier is better** — once the lint gate exists, later
  plans' code passes through it (033 and 034 both list `pnpm lint` as a
  conditional gate).
- 031 and 034 are independent of everything.
- File-overlap map (rebase awareness): 029+030 share the ingest route;
  028+033 share `AccountClient.tsx`; 033+034 share `DashboardClient.tsx`
  (033 adds a test beside it, 034 extracts `TrendChart` out of it — run 033's
  suite after 034 to confirm the extraction was a no-op).

### Earlier generations

- **009 first.** It creates the Vitest setup, the in-memory PGlite test harness (`src/test/db.ts`), and CI that every later plan's test plan relies on. It also extracts ingest parsing into `src/lib/ingest-payload.ts`, which 011 edits.
- **009 also fixed a stale `drizzle/`.** The tracked migrations only covered the
  four Better Auth tables; `audit`, `apiKey` and `violation` had only ever been
  created via `db:push`, so they existed in no migration. Since `railway.json`
  runs `pnpm db:migrate` as its pre-deploy command, a deploy would have built an
  incomplete schema. `0001_public_slapstick.sql` closes the gap. Use
  `pnpm db:generate` — not `db:push` — for schema changes from here (012 depends
  on this).
- **010 before 011** — both edit the ingest handler; 011's validation slots in ahead of 010's transaction.
- **013 and 014 are independent** of the rest (and of each other), but both touch `src/lib/auth.ts` — expect a trivial rebase if run in parallel.
- **012 before 015** — the query rewrite assumes the `violation_audit_idx` index exists.
- 012 is safe to run at any point (schema + generated migration only).

### Direction generation (023–027)

- **All five are independent** — any order works. Suggested: 024 first (the
  only P1 — it closes the last acknowledged security gap), then 023 and 025
  (small user-facing wins), then 026 and 027.
- **024 before 027 is mildly preferable**: 027 documents the ingest response
  table, and 024 adds a 429 row to it. 027 run first must note the pending
  429 (its own maintenance notes cover this).
- **027 is the only cross-repo plan** — it also edits `../mend-a11y`
  (test files and its `test:unit` script only). It requires a clean working
  tree in both repos and does **not** push the extension repo.
- 023 and nothing else touches `src/lib/auth.ts`; 024 and nothing else
  touches the ingest route; 025 and nothing else touches `AccountClient.tsx`
  — no rebase risk between any pair.

### Plan 035 (cross-repo, like 027)

- **035 is the website half of a two-repo feature.** The extension half is
  `../mend-a11y/plans/007-account-key-relay.md`, handed off to a fresh session
  in that repo. Either half can land first — each is inert without the other,
  and neither breaks anything on its own. Unlike 027, 035 does not itself edit
  `../mend-a11y`; it's a separate plan executed as a separate session there.

### Billing / Stripe generation (036–041)

Design source of truth: [`pricing-stripe-design.md`](pricing-stripe-design.md)
(planned at commit `a0f7690`, 2026-07-19). Do not re-litigate Free/Pro numbers
or Checkout vs Elements in plan execution.

```
036 schema + entitlements
 ├─► 037 checkout + portal
 │    ├─► 038 webhooks + beforeDelete
 │    │    └─► 040 account billing UI
 │    └─► 041 pricing + privacy
 └─► 039 enforce limits (gated; runtime depends on 036 only)
```

- **036 first.** Additive schema (`user.stripeCustomerId`, `subscription`,
  `stripe_event`) via `pnpm db:generate` only; pure `entitlements` +
  `billing-queries`. No Stripe package, no ingest enforcement.
- **037 after 036.** `pnpm add stripe`; Checkout + Portal routes; session has
  no `stripeCustomerId` — always Drizzle-load. No webhooks yet.
- **038 after 037.** Signed webhooks (network outside TX; short TX for
  `stripe_event` + upsert); stale-id guard; **ship `beforeDelete` Stripe
  cleanup here** (fail closed). Required before live Pro users can delete.
- **039 after 036** (code may land early). Dual limiters, audit cap
  (existence-first), plan-aware key quota, gated retention. Keep
  `FREE_LIMITS_ENFORCED=false` / `RETENTION_PURGE_ENABLED=false` in production
  until phase C/D (after 040+041). Prefer not flipping Free flags until
  Checkout + pricing exist.
- **040 after 037+038.** Account billing panel, key-quota UX, success/cancel
  pages; `pnpm generate-routes`.
- **041 after 037.** Public `/pricing`, nav/footer, privacy Stripe copy. No
  home-page CTA.
- **Phase C (ops, not a plan):** set `FREE_LIMITS_ENFORCED=true` only after
  040+041 live and founder sign-off. **Phase D:** `RETENTION_PURGE_ENABLED`.
- File-overlap: 039 edits ingest + `account-queries`; 040 edits AccountClient +
  `account-fns`; 038 edits `auth.ts`. 036 is schema-only for migrations.
- Product constants (must stay consistent): Pro **$9/mo · $90/yr**; Free when
  enforced **30d · 200 · 3 keys · 60 rpm**; Pro **2y · 50k · 20 keys · 300 rpm**.

### Feature generation (042–047)

```
042 CTA visibility          (independent)
043 monitor schema + UI ─► 044 scan engine + Run now ─► 045 scheduler
046 VPAT report             (independent)
047 signup → account handoff (independent; cross-repo companion)
```

- **Strict order 043 → 044 → 045**; each is shippable alone (043's UI shows
  "Scheduled" until 044/045 exist; 044's Run now works without the ticker).
- **044 carries the deploy risk**: `nixpacks.toml` adds Chromium to the
  Railway image, and only a production "Run now" proves the launch works.
  045's `MONITOR_SCHEDULER_ENABLED` flag stays unset in Railway until 044's
  deploy verification passed (env-flag phasing, same idea as billing's
  phase C/D). **That verification passed 2026-07-21** — see 044's row — so
  the flag is now cleared to flip. Flipping it is safe with respect to the
  billing interplay below *only while* `FREE_LIMITS_ENFORCED=false`.
- **Cross-generation overlaps with billing (036–041)**: 044 extracts the
  ingest route's transaction into `src/lib/audit-store.ts` while 039 edits
  the same route — whichever lands second re-reads the live file (both plans
  say so). 043 and 036 both append to `src/db/schema.ts` (additive; trivial
  rebase). 041 and 043 both touch `SiteHeader` nav. 042 and 034 both touch
  `DashboardClient.tsx` (034 removes the chart, 042 wraps the CTA — disjoint
  hunks); 046 adds one link to the same app-head block as 042.
- **Billing interplay to resolve when 039 lands** (deliberately not in these
  plans): monitor-created audits count toward the Free 200-audit cap — a
  daily monitor fills it in ~7 months, so either exempt monitor runs, make
  `MAX_MONITORS` plan-aware (Free ~1–2, Pro 10), or gate monitors as
  Pro-only. Decide before `FREE_LIMITS_ENFORCED=true`.
- 046 is independent of everything; more audit data (incl. monitor runs)
  just makes its report richer.
- 042 is independent; do it any time.
- **047 is cross-repo like 035**: the extension half is
  `../mend-a11y/plans/008-account-signup-prompt.md`, executed as its own
  session in that repo; either half can land first. 047 touches the signup /
  login routes and auth components — the pending GitHub genericOAuth change
  edits the same auth form files, so whichever lands second re-checks the
  live files (both drift checks cover them).

### Docs generation (048–050)

```
048 docs foundation ─► 049 VPATs & ACRs guide
                    └► 050 accessibility laws guide
```

- **048 first, strictly** — it creates `DocsArticle`, the `/docs` index,
  the nav entries, and `public/llms.txt` that both guides assume. 049 and
  050 are independent of each other; either order.
- **Nav overlap**: 048 touches `SiteHeader`/`SiteFooter`, which 041
  (pricing) and 043 (monitors) also edit — disjoint one-line hunks, but
  whichever lands later reads the live files.
- **046 interplay is soft**: 049's "How Mend helps" section links `/vpat`
  only if 046 has landed, and shrinks to one sentence otherwise; 050 §8
  likewise mentions monitors/VPAT only if 043+/046 landed. Neither guide
  blocks on any feature plan.
- **Curated, not generated**: the `/docs` index and `llms.txt` are
  hand-maintained — every plan that adds/renames a docs page updates
  both (each guide plan says so).
- **Content plans verify facts at execution time** — 049 against
  ITI/Section508.gov, 050 against primary legal sources — and the plans
  explicitly subordinate their own outlines to those sources. Do not
  transcribe the outlines as copy.

### Animation generation (016–022)

- **016 first, and it must land alone.** It defines the `.enter` / `.reveal`
  primitives and the `--dur-fast` / `--dur-ui` / `--dur-entry` / `--rise` tokens
  that all six others consume. It changes nothing visually on its own — that is
  the point, and its verification checks exactly that.
- **017–019 are the home page** and are independent of each other. 018 is the
  biggest visible win (seven cards, two groups); 017 is the first impression.
  019 is small and standalone.
- **018 before 020.** 018 adds the per-row stagger reset for `.feature-grid`;
  020's verification compares the support FAQ's rhythm against it. 020 needs no
  CSS of its own.
- **021 and 022 are independent** of everything except 016, and of each other.
  Both are CSS-only. 021 covers login *and* signup from one rule, because both
  forms render the same `.auth-sent` class.
- **019 conflicts with 018 if over-applied.** 018 explicitly leaves `.codeflip`
  alone so 019's `clip-path` wipe has it to itself. Do not add `.reveal` to the
  codeflip in either plan.
- Three nested elements in the hero each own exactly one animation —
  `.hero__art` (017's entrance), `.hero__art-inner` (017's parallax), and
  `.panel-mock--float` (the existing drift). Do not consolidate them; the later
  `transform` would silently win and one animation would vanish.

### Generation 051–057

```
051 SSRF redirect guard      (independent — do first)
052 js-yaml override         (independent, quickest win)
053 bound history loads      (independent)
054 structured logging       (independent)
055 shared helpers           (independent)
056 manual-audit auth+tests ─► 057 manual-audit queries layer
        ↑ both blocked on the feature being committed to main
```

- **051 first, and before flipping `MONITOR_SCHEDULER_ENABLED`.** The flag is
  otherwise cleared to turn on (044's gate closed), but doing so makes the
  redirect gap a daily unattended job rather than a manual one.
- **052–055 are independent of everything and of each other.** 052 is the
  cheapest; 053 is the one that matters most as monitor data accumulates.
- **056 before 057, strictly.** 056 builds the test suite that makes 057's
  refactor verifiable. Doing 057 first means restructuring untested code that
  carries an authorization boundary.
- **File overlap — exactly one pair**: 051 and 054 both edit
  `src/lib/scan/scanner.ts` (051 adds the redirect listener inside `runScan`;
  054 converts the one `console.warn` in `withCrashRetry`). Disjoint hunks;
  whichever lands second re-reads the live file. Every other pair in this
  generation touches disjoint files — 054 is the widest-reaching, and none of
  052, 053, 055 share a file with it.

## Findings considered and rejected

So nobody re-audits these (general audit at `9930443`, 2026-07-21):

- **Screenshot path traversal** in `readScreenshot`: not a vulnerability. The
  key pattern `^[0-9a-f-]+\.png$` is anchored, so no `/` or `..` can pass.
  Flagged by an audit agent, checked, cleared.
- **`src/lib/dashboard-data.ts` as a god-module** (523 lines): it is a flat,
  hand-written rules catalogue plus small pure helpers, not tangled logic.
  Not worth a refactor.
- **`DashboardClient.tsx` (588) / `AccountClient.tsx` (491) file splits**:
  `AccountClient` is already decomposed in-file into three components, and
  `DashboardClient` is mostly JSX with clean `useMemo` derivations. Legitimate
  tidy-up, low leverage, not recommended standalone.
- **esbuild advisories** (moderate + low): re-verified, not assumed — both
  reach only through `drizzle-kit`, a devDependency never bundled into the
  production server. No overrides worth adding.
- **TypeScript 5.9 → 7.0**: 7.0 is the ground-up native compiler rewrite and
  had just shipped at audit time. High risk, no urgent benefit, ecosystem
  unvalidated. Revisit after a few patch releases.
- **`.replace(/^https?:\/\//, "")` repeated 4× in `DashboardClient.tsx`**:
  real but trivial and single-file. Fix opportunistically, not deliberately.
- **`db:push` still in `package.json`**: flagged as a foot-gun given the drift
  incident `CLAUDE.md` records. Left alone — MED confidence only, because a
  local prototyping use case cannot be ruled out from the repo. Worth asking
  the maintainer, not worth a plan.

Parked, not rejected, from this generation: **`export-data.ts`'s unbounded
violation load** (needs a product answer first — is the JSON export "current
state" or "everything ever"? see 053's out-of-scope note); **request-id
correlation** in logging (needs every handler signature touched — see 054);
**nonce-based `script-src` CSP** (the framework exposes
`router.options.ssr.nonce`; see the warning block in
`src/lib/security-headers.ts` before attempting it); and the **doxy.me
renderer crash** (mitigated by a retry in `9930443`, root cause likely
Railway container memory, unmeasured).

So nobody re-audits these (general audit at `0be29dc`, 2026-07-18):

- **Better Auth secret handling**: no fail-fast needed — better-auth itself
  throws in production when `BETTER_AUTH_SECRET` is missing or left at the
  default (verified in `node_modules/better-auth/dist/context/create-context.mjs`,
  `validateSecret`).
- **Mailer outage failing signup**: doesn't happen — better-auth wraps
  `sendVerificationEmail` in `runInBackgroundOrAwait`, which catches and logs;
  a Resend failure can't fail the signup request.
- **Dependency audit**: only two advisories (esbuild dev-server, low/moderate)
  confined to dev tooling (`vite`, `drizzle-kit` build chains) — unreachable
  in production code; not worth pinning overrides.
- **Unauthenticated API-key guessing as DoS/bruteforce**: keys are 32 bytes of
  CSPRNG behind an indexed SHA-256 lookup — guessing is infeasible and each
  attempt is one cheap SELECT; per-IP limiting not warranted on this surface.
- **`lastUsedAt` write amplification**: real but folded into plan 030 rather
  than its own finding.
- **Missing security headers (CSP, frame-ancestors, HSTS, nosniff,
  Referrer-Policy)**: genuine gap, surfaced to the maintainer and *not
  selected* for this generation — CSP in particular needs care with SSR inline
  scripts. Re-raise if the portal's attack surface grows; don't treat this
  entry as "considered fine".

Direction ideas surfaced but not planned this generation (parked, not
rejected): **delete a single audit** (deleteAllAudits exists but no per-run
delete — granularity mismatch with the privacy copy) and **import the JSON
export** (`mend-export/v1` is export-only; import would make it a real
portability format). The third idea, the per-page trend, became plan 034.

So nobody re-audits these (general audit at `dbd4669`):

- **CORS wildcard on `/api/ingest`**: correct by design — auth is a bearer key, never a cookie, and browsers refuse wildcard + credentials. Documented in a comment in the route.
- **Magic-link URL logged to console**: explicit, gated TODO (`VITE_AUTH_MAGIC_LINK` off by default); plan 013 routes it through the new mailer anyway.
- **SHA-256 (not bcrypt) for API-key hashing**: correct for 32-byte CSPRNG tokens — slow hashes are for low-entropy passwords.
- **Ingested HTML snippets as XSS vector**: not exploitable — React escapes them (`<code>{node.html}</code>` in the details route).
- **Trend "carry-forward" semantics** (a page not re-scanned keeps its last total): by design; preserved verbatim in plan 015.
- Minor nits folded into plans or not worth one: stale `NEXT_PUBLIC_AUTH_MAGIC_LINK` comment in `src/lib/auth-client.ts:5`; unused `requireUser` export in `src/lib/session-fns.ts`; privacy-page meta description overbreadth (fixed by plan 014).

So nobody re-litigates these (animation audit at `88d2ab8`):

- **Auto-cycling the codeflip before ⇄ after every 3s**: requested during the audit, rejected and replaced by 019's one-shot scroll-driven wipe. An indefinite loop is a WCAG 2.2.2 (Pause, Stop, Hide) failure — automatically-starting motion running past 5s needs a pause control, and `aria-hidden` does not exempt it, since 2.2.2 governs visual motion. Shipping that inside the "It passes its own audit" section is not a trade worth making. Scroll-driven motion is user-initiated, so 019 sidesteps it entirely.
- **JS/IntersectionObserver scroll reveal**: rejected in favour of CSS `@supports (animation-timeline: view())`. The JS pattern requires an `opacity: 0` resting state that only JS clears — so a hydration failure hides the entire page permanently. Unacceptable for an accessibility product, and `@supports` degrades to "just show the content" for free. It matches the `@supports (animation-timeline: view())` house style in `src/styles/globals.css`.
- **The global reduced-motion kill switch** (`src/styles/globals.css:143-149`): still a deliberate default; new motion opts out locally by being gated on `no-preference` (plan 002 settled this). Note the sharp edge that shaped plan 016: it kills `animation-duration` and `animation-iteration-count` but **not** `animation-delay`, so a staggered entrance left active under reduced motion would hold at `opacity: 0` for its delay and then snap in.
- **Revealing the privacy/support prose bodies on scroll**: deliberately not done (see 020). These are read, not sold — animating body text delays the words at the moment the reader wants them.
- **Expressive motion on dashboard filtering**: deliberately restrained to a 160ms opacity-only fade (see 022). Filtering is high-frequency UI, where the playbook reduces motion rather than adding it.
- **Rewriting `.sk` to animate `transform` instead of `background-position`**: `background-position` is not compositable, but it is a few skeleton blocks shown briefly. 022 fixes only the timing function (`ease` → `linear`, which was causing a visible hitch at each loop boundary) and leaves the technique alone.
- **Exit animations** for the auth form (021) and filtered-out dashboard rows (022): CSS cannot animate what React has unmounted, and a View Transition or exit-animation library is disproportionate machinery for either. Both entrances carry the meaning on their own. (This rejects exit animations for *those two components*, not the page-level cross-fade added later — see below.)

Landed after the audit (2026-07-17), so nobody reverts them:

- **The FAQ accordion no longer uses `interpolate-size`.** Plan 005 gated the
  reveal on `@supports (interpolate-size: allow-keywords)`, accepting that only
  Chrome would animate. That property is still Chromium-only in mid-2026, so
  Firefox and Safari snapped the panel open. It now animates `::details-content`
  (Baseline since Sept 2025) as a one-row grid from `0fr` to `1fr` — real
  numbers every engine can interpolate — so the `@supports` gate is gone and all
  three engines animate. Do not "restore" `interpolate-size`. Verified in
  Chromium and WebKit; Firefox's Playwright build would not launch locally, so it
  is reasoned from support data, not observed.
- **Page cross-fade** via `defaultViewTransition: true` (`src/router.tsx`).
  Same-document view transitions are Baseline; the UA default is 250ms, which is
  already `--dur-ui`. The sharp edge: the reduced-motion kill switch selects
  `*, *::before, *::after`, which **cannot** reach the `::view-transition-*`
  pseudos — they sit in their own tree off the root — so they need the explicit
  `animation: none` opt-out that now sits in that same block. Removing it
  silently re-animates the page for reduced-motion users.

## Direction ideas surfaced but not planned

All five ideas this section used to hold became plans 023–027 on 2026-07-17:
rate limiting → 024, email verification → 023, rule catalogue → 026, shared
ingest contract → 027, data export → 025. Two new ideas from the `0be29dc`
audit are parked (see the end of the `0be29dc` block above): per-audit delete
and JSON-export import.
One decision from that promotion worth keeping visible: the rate-limit infra
question ("single node or shared store?") was resolved as **single node,
in-process** — `railway.json` runs one service; 024 documents when that
choice must be revisited.
