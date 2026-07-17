# Implementation Plans

Three audit generations share this directory, with monotonic numbering:

- **001–008** — an `improve-animations` audit at commit `b5deaa1` (2026-07-16). All landed in commit `dbd4669`.
- **009–015** — an `improve` (general) audit at commit `dbd4669` (2026-07-16).
- **016–022** — a second `improve-animations` audit at commit `88d2ab8` (2026-07-17), this one **additive**. The 001–008 generation was corrective: it fixed motion that already existed, and re-checking it at `88d2ab8` found its work intact and almost nothing left to correct. But a corrective audit can only ever fix what is already animating — it never asks what *should* animate. This generation answers that. The home page had exactly one animation (the hero panel's drift); no page revealed anything on scroll.

Each plan is self-contained — an executor needs no other context. Read the plan fully before starting, honor its STOP conditions, and update your status row when done.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | [Add motion tokens to the design system](001-motion-tokens.md) | — | S | — | DONE |
| 002 | [Fix the frozen spinner under prefers-reduced-motion](002-reduced-motion-spinner.md) | — | S | — | DONE |
| 003 | [Remove the skip link's focus animation](003-skip-link-no-animation.md) | — | S | — | DONE |
| 004 | [Gate button hover lift; add press feedback](004-button-hover-gate-press-feedback.md) | — | S | 001 | DONE |
| 005 | [Animate the FAQ answer reveal](005-faq-details-reveal.md) | — | S | 001 | DONE |
| 006 | [Give the API key reveal an entrance](006-api-key-reveal-entrance.md) | — | S | 001 | DONE |
| 007 | [Fade the dashboard in over its skeleton](007-dashboard-loaded-fade.md) | — | S | 001 | DONE |
| 008 | [Make the hero's floating panel float](008-hero-panel-drift.md) | — | S | — | DONE |
| 009 | [Establish a test suite (Vitest) and CI](009-test-and-ci-baseline.md) | P1 | M | — | DONE |
| 010 | [Make ingest write audit + violations atomically](010-transactional-ingest.md) | P1 | S | 009 | DONE |
| 011 | [Cap ingest payload sizes, timestamps, and keys per user](011-ingest-abuse-limits.md) | P1 | S | 009, 010 | DONE |
| 013 | [Replace the dead "Forgot password?" link with a working reset flow](013-password-reset.md) | P1 | M | — | TODO |
| 012 | [Index `violation.auditId`](012-violation-auditid-index.md) | P2 | S | — | TODO |
| 014 | [Let users delete their synced audits and their account](014-data-deletion.md) | P2 | M | — | TODO |
| 015 | [Stop the dashboard loading every run's full violation payload](015-dashboard-query-scalability.md) | P3 | M | 009, 012 | TODO |
| 016 | [Add entrance & scroll-reveal motion primitives](016-motion-primitives.md) | — | S | — | DONE |
| 017 | [Stagger the home hero's entrance and drift its art on scroll](017-hero-entrance.md) | — | S | 016 | DONE |
| 018 | [Reveal the home page's feature cards and steps on scroll](018-home-scroll-reveal.md) | — | S | 016 | DONE |
| 019 | [Wipe the codeflip's "After" row in on scroll](019-codeflip-wipe.md) | — | S | 016 | DONE |
| 020 | [Animate the support and privacy page entrances](020-marketing-prose-pages.md) | — | S | 016, 018 | DONE |
| 021 | [Give the auth "Check your inbox" panel an entrance](021-auth-sent-transition.md) | — | S | 016 | DONE |
| 022 | [Fade dashboard filter results in; fix the skeleton shimmer's easing](022-dashboard-filter-and-shimmer.md) | — | S | 016 | DONE |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with one-line reason) | REJECTED (with one-line rationale)

## Dependency notes

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

- **Rate limiting `/api/ingest`** (requests/minute), deferred out of plan 011 on
  purpose: it needs an infra decision, not code. Single node → an in-process
  limiter is fine; serverless → it needs a shared store. 011's caps bound the
  size of any one request, not their frequency, so this is the remaining gap.
- Wire email verification once plan 013's mailer lands (one config block).
- Expand the hand-written rule catalogue in `src/lib/dashboard-data.ts` (13 rules today; unknown rules fall back to generic copy on the details page).
- Share the ingest payload contract with the extension repo (`../mend-a11y`) as a versioned schema to prevent drift.
- GDPR-style data export ("download my audits as JSON") pairing with plan 014's danger zone.
