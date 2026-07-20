# Plan 048: Documentation section foundation (`/docs` + llms.txt)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 9281534..HEAD -- src/components/SiteHeader.tsx src/components/SiteFooter.tsx src/routes`
> Plans 041 (pricing nav/footer) and 043 (monitors nav) touch the same two
> nav components. That is fine — the hunks are disjoint (each plan adds its
> own link) — but read the *live* files before editing; do not assume the
> line numbers below survived. If a `/docs` route already exists, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (static pages; no schema, no auth surface, no billing)
- **Depends on**: none
- **Category**: feature — user-requested (documentation initiative)
- **Planned at**: commit `9281534`, 2026-07-20

## Why this matters

The founder wants the website to carry genuinely useful documentation —
starting with two guides: **VPATs & ACRs** (plan 049) and **accessibility
laws & legal compliance** (plan 050). Today the site has no docs section at
all: the only prose pages are `/privacy` and `/support`. Both guide plans
need a home, a shared article idiom, and discoverability — that shared
foundation is this plan, so the two content plans stay content-only and can
be executed independently of each other.

The declared inspiration is Level Access's LLM-resources approach
(https://www.levelaccess.com/llm-resources/): documentation written to be
useful to humans *and* legible to AI assistants that increasingly answer
"what is a VPAT?"-type questions. This plan captures that with a curated
`/llms.txt` (llmstxt.org convention) alongside conventional, accessible,
SEO-sound HTML pages. It does **not** copy Level Access content or tone —
Mend's docs are educational guides, not vendor self-description.

## Design decisions (settled — do not re-litigate)

- **URL scheme**: `/docs` index + `/docs/<slug>` articles. Slugs are set by
  the content plans (049: `vpats-and-acrs`; 050: `accessibility-laws`).
- **Authoring format**: TSX routes using the existing `MarketingShell` /
  `page-head` / prose idioms — the house pattern (`privacy.tsx`,
  `support.tsx`). **No markdown pipeline** in v1: two articles do not
  justify a content-layer dependency, and TSX keeps full control of
  headings/landmarks on an accessibility product's own site.
- **Shared layout**: a small `DocsArticle` component (title, eyebrow,
  lede, a "Last reviewed" date line, and an "All guides" back link) so
  articles stay consistent without a heavyweight docs framework. No
  sidebar, no search, no versioning in v1.
- **LLM legibility**: one hand-maintained `public/llms.txt` following the
  llmstxt.org shape — H1, one-paragraph blockquote about Mend, then a
  `## Docs` link list (absolute URLs) with one-line descriptions. It links
  to the HTML pages; markdown mirrors of each article are deferred (see
  Maintenance notes). No auto-generation.
- **Nav placement**: "Docs" enters the header nav between Home and
  Privacy, and the footer link list. `NavPage` union gains `"docs"`; both
  articles and the index pass `current="docs"`.
- **Honesty is a docs-wide rule**: no page may claim Mend (or any
  automated tool) makes a site "compliant" or "certified". This is the
  same product stance as plan 046's hard requirement, applied to prose.

## Current state

- Prose-page idiom: `src/routes/support.tsx` and `src/routes/privacy.tsx` —
  `createFileRoute` with a `loader: () => getSessionUser()` (keeps the
  header account-aware), `head` with title + meta description,
  `MarketingShell` wrapper, `wrap page-head` intro, `section--tight`
  sections, `enter`/`reveal` animation classes. Mirror all of it.
- Nav: `src/components/SiteHeader.tsx` (`NavPage` union at the top, links
  in the `site-nav` block) and `src/components/SiteFooter.tsx`
  (`footer-links` block).
- Static assets: `public/` (currently just `favicon.svg`) is served at the
  site root, so `public/llms.txt` ⇒ `/llms.txt`.
- Site config: `src/lib/site.ts` — no canonical-origin value exists. The
  llms.txt is a static file, so hardcode the production origin there (find
  it in `railway.json`/deploy config or ask the operator if absent; do
  **not** invent one).
- Route generation: `src/routeTree.gen.ts` is gitignored — run
  `pnpm generate-routes` after adding routes.

## Commands you will need

| Purpose   | Command                                   | Expected |
|-----------|-------------------------------------------|----------|
| Routes    | `pnpm generate-routes`                    | regenerated |
| Typecheck | `pnpm typecheck`                          | exit 0   |
| Tests     | `pnpm test`                               | all pass |
| Lint/Build| `pnpm lint && pnpm build`                 | exit 0   |

## Scope

**In scope**:
- `src/components/DocsArticle.tsx` — shared article layout
- `src/routes/docs/index.tsx` — the guides index
- `src/components/SiteHeader.tsx` + `SiteFooter.tsx` — "Docs" links
- `public/llms.txt`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- The two articles themselves (plans 049 and 050)
- A markdown/MDX content pipeline, docs search, sidebar navigation
- Markdown mirrors of articles, `llms-full.txt`
- `robots.txt` / sitemap work (none exists today; separate concern)

## Git workflow

Work directly on `main`; commit e.g. `Add a documentation section and llms.txt`.
Do NOT push unless the operator instructed it.

## Steps

### Step 1: Nav

Add `"docs"` to the `NavPage` union in `SiteHeader.tsx` and a
`<Link to="/docs">Docs</Link>` with the same `aria-current` pattern as its
siblings, placed after Home. Add `<Link to="/docs">Docs</Link>` to the
`footer-links` nav in `SiteFooter.tsx`. Read both live files first (041/043
overlap).

### Step 2: `DocsArticle` layout

`src/components/DocsArticle.tsx`: props
`{ eyebrow: string; title: string; lede: ReactNode; lastReviewed: string;
children: ReactNode }`. Renders the `wrap page-head` intro (eyebrow/h1/lede
with the `enter` classes, exactly like `support.tsx`), a small muted
"Last reviewed: {date}" line, then `{children}`, then a closing
`section--tight` block with a `Link to="/docs"` "← All guides". It does
**not** render `MarketingShell` — the route owns the shell (loader/account
wiring stays in routes, matching the house pattern).

### Step 3: The index

`src/routes/docs/index.tsx` — loader/head/shell mirroring `support.tsx`
(`current="docs"`; title "Docs — Mend"; meta description saying these are
plain-language guides to accessibility conformance and law). Content: a
`page-head` intro ("Guides", one-sentence promise: plain-language,
no-scare-tactics accessibility documentation) and a card/list of guides
using existing panel/card classes from `globals.css` (read how the home
page builds card grids and reuse those classes — add no new CSS unless
nothing fits). List both planned guides. For any guide whose route does not
exist yet at execution time, render the entry unlinked with a "coming soon"
note rather than a dead link — check which of 049/050 have landed.

### Step 4: `public/llms.txt`

llmstxt.org shape:

```
# Mend

> Mend is a free, open-source browser extension that audits web pages for
> WCAG 2.0/2.1/2.2 accessibility issues using axe-core, entirely on-device,
> with an optional cloud dashboard for history, monitoring, and reports.

## Docs

- [VPATs and ACRs](https://<origin>/docs/vpats-and-acrs): What VPAT®
  documents and Accessibility Conformance Reports are, who asks for them,
  and how to read and produce one.
- [Accessibility laws](https://<origin>/docs/accessibility-laws): Plain-
  language overview of the ADA, Section 508, the European Accessibility
  Act, EN 301 549, and other accessibility law. Not legal advice.

## Product

- [Home](https://<origin>/): What Mend does.
- [Privacy](https://<origin>/privacy): On-device processing; what the
  optional dashboard stores.
- [Support](https://<origin>/support): FAQ and contact.
```

Adjust the descriptions to match reality at execution time (e.g. only list
docs pages that exist — same landed-check as Step 3; include `/pricing`
only if plan 041 landed). Every factual claim in the blockquote must be
true of the shipped product — verify against the home page copy.

### Step 5: Full gate

`pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
→ all exit 0. Manual: `pnpm dev`; check `/docs` renders, header/footer
links navigate, `aria-current="page"` lands on Docs, keyboard-only
navigation works, and `curl localhost:<port>/llms.txt` returns the file.

## Done criteria

- [ ] `/docs` renders with the shared shell; Docs appears in header and
      footer nav with correct `aria-current`
- [ ] `DocsArticle` exists and is exercised by the index or a landed
      article
- [ ] `/llms.txt` serves the curated file; every URL in it resolves
- [ ] No new CSS unless justified in the status row
- [ ] Full gate exits 0; no out-of-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- A `/docs` route or docs framework already exists (someone got here
  first).
- The production origin for llms.txt URLs cannot be determined from the
  repo/deploy config — ask the operator; do not guess a domain.
- `SiteHeader`/`SiteFooter` have diverged so far from the shapes above
  that the nav addition isn't a one-liner — report before restructuring.

## Maintenance notes

- When articles are added/renamed, `public/llms.txt` and the `/docs` index
  must be updated by hand — both are curated, not generated. Cheap at this
  scale; revisit generation if the docs count passes ~10.
- Markdown mirrors (`/docs/<slug>.md`) and `llms-full.txt` are the natural
  next step for LLM legibility if the founder wants to go further — that
  would motivate flipping authoring to markdown-with-a-renderer rather
  than maintaining two copies. Deferred deliberately.
- A sitemap/robots.txt would help the same discoverability goal; neither
  exists today and neither is part of this plan.
