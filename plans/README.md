# Animation improvement plans

Written by an `improve-animations` audit at commit `b5deaa1` (2026-07-16). Each plan is self-contained — an executor needs no other context. Run one with `improve-animations execute <plan>` or hand it to any agent.

## Plans

| # | Plan | Severity | Category | Status |
| --- | --- | --- | --- | --- |
| 001 | [Add motion tokens to the design system](001-motion-tokens.md) | LOW (foundational) | Cohesion & tokens | DONE |
| 002 | [Fix the frozen spinner under prefers-reduced-motion](002-reduced-motion-spinner.md) | HIGH | Accessibility | DONE |
| 003 | [Remove the skip link's focus animation](003-skip-link-no-animation.md) | HIGH | Purpose & frequency | DONE |
| 004 | [Gate button hover lift; add press feedback](004-button-hover-gate-press-feedback.md) | MEDIUM | Accessibility / Physicality | DONE |
| 005 | [Animate the FAQ answer reveal](005-faq-details-reveal.md) | MEDIUM | Cohesion | DONE |
| 006 | [Give the API key reveal an entrance](006-api-key-reveal-entrance.md) | LOW | Missed opportunity | DONE |
| 007 | [Fade the dashboard in over its skeleton](007-dashboard-loaded-fade.md) | LOW | Missed opportunity | DONE |
| 008 | [Make the hero's floating panel float](008-hero-panel-drift.md) | LOW | Missed opportunity | DONE |

## Recommended execution order

1. **002** — the HIGH accessibility bug; independent of everything else, ship first.
2. **003** — one-line deletion, independent.
3. **001** — the token foundation; do before 004–007.
4. **004**, then **005** — the remaining corrective findings (both consume `--ease-out`/`--ease-in-out` from 001).
5. **006**, **007**, **008** — additive polish, any order (006 and 007 share the `@starting-style` pattern; doing 006 first gives 007 an in-repo exemplar).

## Dependencies

- 004, 005, 006, 007 use the easing tokens added by **001**. Each plan includes the literal cubic-bezier fallback if 001 hasn't landed, but running 001 first keeps the stylesheet clean.
- 008 deliberately does **not** use the strong tokens (gentle built-in `ease-in-out` is correct for ambient motion) and has no dependencies.
- 002 and 003 are fully independent.

## Status legend

`TODO` → `IN PROGRESS` → `DONE` (update the table when a plan lands; `improve-animations reconcile` refreshes stale line references and retires fixed findings).
