# Implementation Plans

Four audit generations share this directory, with monotonic numbering:

- **001–008** — an `improve-animations` audit at commit `b5deaa1` (2026-07-16). All landed in commit `dbd4669`.
- **009–015** — an `improve` (general) audit at commit `dbd4669` (2026-07-16).
- **016–022** — a second `improve-animations` audit at commit `88d2ab8` (2026-07-17), this one **additive**. The 001–008 generation was corrective: it fixed motion that already existed, and re-checking it at `88d2ab8` found its work intact and almost nothing left to correct. But a corrective audit can only ever fix what is already animating — it never asks what *should* animate. This generation answers that. The home page had exactly one animation (the hero panel's drift); no page revealed anything on scroll.
- **023–027** — planned at commit `cb1bec2` (2026-07-17), not from a fresh audit: these are the five "Direction ideas surfaced but not planned" from the 009–015 generation, promoted to full plans now that everything they waited on has landed.
- **028–034** — an `improve` (general) audit at commit `0be29dc` (2026-07-18), the second full-repo pass. Baseline at audit time: typecheck clean, 216 tests green. The headline finding is 028 (OAuth-only users cannot delete their account — the danger zone demands a password they don't have); the rest is small hardening (029, 030), a doc correction with history behind it (031), toolchain and test-layer additions (032, 033), and one promoted direction idea (034).

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
| [029](029-ingest-500-cors.md) | CORS-visible JSON errors on ingest failure | P1 | S | — | TODO |
| [030](030-ingest-body-cap-and-write-order.md) | Early body-size gate + lastUsedAt after rate limit | P2 | S | 029 | TODO |
| [031](031-retire-db-push-from-docs.md) | Docs bootstrap with db:migrate, not db:push | P2 | S | — | TODO |
| [032](032-lint-gate.md) | Add a Biome lint gate to the toolchain and CI | P2 | M | — | TODO |
| [033](033-component-test-layer.md) | Component-test layer for dashboard + account | P3 | M | 028, 032 | TODO |
| [034](034-detail-page-trend.md) | Per-page violation trend on the detail page | P3 | M | — | TODO |

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

## Findings considered and rejected

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
