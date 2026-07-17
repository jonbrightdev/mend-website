# Implementation Plans

Two audit generations share this directory, with monotonic numbering:

- **001–008** — an `improve-animations` audit at commit `b5deaa1` (2026-07-16). All landed in commit `dbd4669`.
- **009–015** — an `improve` (general) audit at commit `dbd4669` (2026-07-16).

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
| 010 | [Make ingest write audit + violations atomically](010-transactional-ingest.md) | P1 | S | 009 | TODO |
| 011 | [Cap ingest payload sizes, timestamps, and keys per user](011-ingest-abuse-limits.md) | P1 | S | 009, 010 | TODO |
| 013 | [Replace the dead "Forgot password?" link with a working reset flow](013-password-reset.md) | P1 | M | — | TODO |
| 012 | [Index `violation.auditId`](012-violation-auditid-index.md) | P2 | S | — | TODO |
| 014 | [Let users delete their synced audits and their account](014-data-deletion.md) | P2 | M | — | TODO |
| 015 | [Stop the dashboard loading every run's full violation payload](015-dashboard-query-scalability.md) | P3 | M | 009, 012 | TODO |

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

## Findings considered and rejected

So nobody re-audits these (general audit at `dbd4669`):

- **CORS wildcard on `/api/ingest`**: correct by design — auth is a bearer key, never a cookie, and browsers refuse wildcard + credentials. Documented in a comment in the route.
- **Magic-link URL logged to console**: explicit, gated TODO (`VITE_AUTH_MAGIC_LINK` off by default); plan 013 routes it through the new mailer anyway.
- **SHA-256 (not bcrypt) for API-key hashing**: correct for 32-byte CSPRNG tokens — slow hashes are for low-entropy passwords.
- **Ingested HTML snippets as XSS vector**: not exploitable — React escapes them (`<code>{node.html}</code>` in the details route).
- **Trend "carry-forward" semantics** (a page not re-scanned keeps its last total): by design; preserved verbatim in plan 015.
- Minor nits folded into plans or not worth one: stale `NEXT_PUBLIC_AUTH_MAGIC_LINK` comment in `src/lib/auth-client.ts:5`; unused `requireUser` export in `src/lib/session-fns.ts`; privacy-page meta description overbreadth (fixed by plan 014).

## Direction ideas surfaced but not planned

- Wire email verification once plan 013's mailer lands (one config block).
- Expand the hand-written rule catalogue in `src/lib/dashboard-data.ts` (13 rules today; unknown rules fall back to generic copy on the details page).
- Share the ingest payload contract with the extension repo (`../mend-a11y`) as a versioned schema to prevent drift.
- GDPR-style data export ("download my audits as JSON") pairing with plan 014's danger zone.
