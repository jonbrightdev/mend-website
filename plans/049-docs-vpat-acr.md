# Plan 049: Docs guide — "VPATs and ACRs"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: confirm plan 048 landed —
> `src/components/DocsArticle.tsx` and `src/routes/docs/index.tsx` exist.
> If not, STOP (048 is a hard dependency). Also check whether plan 046
> (`/vpat` report feature) has landed — it changes one section below but
> blocks nothing.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MEDIUM (static page; the risk is *factual accuracy* —
  VPAT edition/version facts must be verified at execution time, not
  recalled)
- **Depends on**: 048 (docs foundation); 046 optional (adds a live
  feature tie-in)
- **Category**: content — user-requested (documentation initiative)
- **Planned at**: commit `9281534`, 2026-07-20

## Terminology note (read before writing anything)

The founder's request was "VPATs and MCR". **"MCR" is not a standard term
in the accessibility-conformance world** — the industry pairing is
**VPAT** (the Voluntary Product Accessibility Template, ITI's blank
template) and **ACR** (Accessibility Conformance Report, a completed
VPAT). Web research at planning time (ITI, Section508.gov, Level Access's
own glossary) surfaced no "MCR". This plan therefore covers **VPATs and
ACRs** and assumes MCR was a slip for ACR. The guide itself must not
mention "MCR" — do not teach readers a term that doesn't exist. If the
operator states MCR means something specific and distinct, STOP and
surface it (see STOP conditions).

## Why this matters

Procurement teams — US federal buyers under Section 508, but increasingly
state, education, and enterprise buyers too — ask vendors for a VPAT/ACR.
Most vendors meeting the request for the first time don't know what the
document is, which edition to use, or what the conformance vocabulary
means; most buyers receiving one don't know how to read it critically.
A plain-language guide serves both, positions Mend credibly in searches
and LLM answers about this topic (the Level Access inspiration), and gives
plan 046's on-demand VPAT-format report feature the educational context it
deserves.

## Design decisions (settled — do not re-litigate)

- **Route**: `/docs/vpats-and-acrs`, rendered via `DocsArticle` inside
  `MarketingShell` with `current="docs"` — exactly the idiom 048 built.
- **Educational, vendor-neutral tone.** The guide teaches the document
  class; Mend appears in exactly one clearly-bounded section ("How Mend
  helps") and nowhere else. No fear-mongering, no "you must buy a tool".
- **Honesty framing is a hard requirement** (same stance as plan 046): the
  guide must state that automated testing covers only a subset of each
  WCAG criterion and that a credible ACR rests on human evaluation.
  Nothing in the guide may imply an automated scan alone yields a
  conformance claim.
- **Facts are verified at execution time.** The outline below encodes the
  planner's understanding (VPAT 2.5 current; four editions; five
  conformance terms). The executor must verify every such fact against
  primary sources — ITI (https://www.itic.org, the VPAT publisher) and
  Section508.gov (https://www.section508.gov/sell/acr/), not vendor blogs
  — and the primary source wins over this plan. Note corrections in the
  status row.
- **Trademark note**: VPAT is a registered trademark of the Information
  Technology Industry Council (ITI). The guide says so once, near where
  the term is defined or in a closing note. Non-optional.
- **"Last reviewed" date** (a `DocsArticle` prop) is set to the execution
  date — this content dates.

## Current state

- Docs idioms from 048: `DocsArticle`, the `/docs` index (this guide's
  entry may already sit there as "coming soon" — link it up), and
  `public/llms.txt` (verify/adjust this guide's line and description).
- FAQ idiom: `support.tsx` renders `details.reveal` accordions inside a
  `.faq.reveal-group` — reuse for this guide's FAQ section.
- Plan 046 feature (if landed): authed `/vpat` preview page + `GET
  /api/vpat` download producing an "automated assessment (VPAT® 2.5
  format)" HTML report. Check `src/routes/vpat.tsx` existence.

## Commands you will need

| Purpose   | Command                                   | Expected |
|-----------|-------------------------------------------|----------|
| Routes    | `pnpm generate-routes`                    | regenerated |
| Typecheck | `pnpm typecheck`                          | exit 0   |
| Tests     | `pnpm test`                               | all pass |
| Lint/Build| `pnpm lint && pnpm build`                 | exit 0   |

## Scope

**In scope**:
- `src/routes/docs/vpats-and-acrs.tsx` — the guide
- `src/routes/docs/index.tsx` — link the entry (if 048 left it unlinked)
- `public/llms.txt` — confirm/fix this guide's line
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- The `/vpat` feature itself (plan 046) — this is prose about the topic
- The accessibility-laws guide (plan 050) — cross-link only if it exists
- Downloadable templates, PDFs, or any generated document
- New CSS, new components (the 048 idioms must suffice)

## Git workflow

Work directly on `main`; commit e.g. `Add the VPATs and ACRs docs guide`.
Do NOT push unless the operator instructed it.

## Steps

### Step 1: Verify the facts

Before writing copy, confirm via ITI and Section508.gov (WebFetch/search):
the current VPAT version number; the list of editions (planner's
understanding: **508**, **EU** (EN 301 549), **WCAG**, and **INT**); which
WCAG version(s) the current WCAG edition covers; the exact conformance-
level vocabulary and its rules (planner's understanding: *Supports*,
*Partially Supports*, *Does Not Support*, *Not Applicable*, plus *Not
Evaluated* being permitted only for WCAG Level AAA rows). Where reality
differs from this plan, reality wins — record the correction.

### Step 2: Write the guide

`src/routes/docs/vpats-and-acrs.tsx` — head meta: title
"VPATs and ACRs, explained — Mend"; description ≤160 chars, plain
language, no superlatives. Sections (h2s, in order):

1. **The 30-second version.** VPAT = the blank template ITI publishes;
   ACR = the completed report a vendor fills in for one product. People
   say "a VPAT" when they mean the ACR; fine conversationally, but the
   distinction matters when a buyer asks "send us your VPAT".
2. **What's in one.** The editions and picking between them; the
   per-criterion table structure (criteria / conformance level / remarks);
   the conformance vocabulary from Step 1 with one-line meanings and the
   note that the remarks column is where the honesty lives.
3. **Who asks, and why.** Section 508 procurement; state/local (tie to
   ADA Title II — cross-link plan 050's guide *only if it exists*);
   education (often via 508-derived policy); enterprise vendor-risk
   reviews and the EAA making conformance documentation table stakes in
   the EU.
4. **How to read one critically** (for buyers): a wall of "Supports" with
   an empty remarks column is a smell; check the evaluation methods
   section (who tested, with what, when); check the date and product
   version; "Partially Supports" with specific, dated remarks signals
   more diligence than unqualified perfection.
5. **How to produce a credible one** (for vendors): start from the real
   template; test before you fill (automated + manual/AT); be specific in
   remarks; version and re-issue as the product changes; never outsource
   the claim to a tool without human review — this is where the honesty
   framing lands hardest.
6. **How Mend helps** (bounded): Mend's audits map findings to WCAG
   criteria, which is the raw material for the conformance table. If plan
   046 landed: link `/vpat` and describe the on-demand automated-
   assessment report *with its caveat repeated* (it is a starting point a
   human completes, not a finished conformance claim). If 046 has not
   landed: this section shrinks to the raw-material sentence — no promise
   of an unshipped feature.
7. **FAQ** (`details.reveal` idiom, 4–6 entries): Is a VPAT legally
   required? (No law mandates one; procurement contracts demand them.)
   How often to update? Can an automated tool generate my ACR? (Partly —
   caveat.) VPAT vs accessibility statement? What does it cost to have
   one produced?
8. Closing note: the ITI trademark attribution and a plain-text pointer
   to ITI's page as the authoritative source.

Wrap sections in the `section--tight`/`reveal` idioms per 048's article
pattern. All headings hierarchical (one h1 from `DocsArticle`, h2
sections, h3 only inside them) — this site must pass its own audit.

### Step 3: Wire up

Link the guide from the `/docs` index (replace any "coming soon" state);
confirm its `public/llms.txt` entry matches the final URL and a one-line
description of the shipped content. `pnpm generate-routes`.

### Step 4: Full gate

`pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
→ all exit 0. Manual: `pnpm dev`; read the whole page; check heading
order, keyboard access on the FAQ accordions, and that no sentence
overstates what automated testing proves.

## Done criteria

- [ ] Step 1 facts verified against ITI/Section508.gov; corrections (if
      any) noted in the status row
- [ ] Guide renders at `/docs/vpats-and-acrs` via `DocsArticle`; heading
      hierarchy clean
- [ ] Honesty framing present in sections 5 and 6 (grep the source for
      the automated-testing caveat)
- [ ] ITI trademark note present; "MCR" appears nowhere in the page
- [ ] Index + llms.txt link the live guide
- [ ] Full gate exits 0; no out-of-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 048 has not landed (no `DocsArticle` / `/docs` index).
- The operator clarifies that "MCR" means something distinct from ACR —
  the terminology assumption above is void; surface it rather than
  guessing what to write.
- Anyone asks to soften the automated-assessment caveats or to write
  copy implying Mend outputs a finished conformance claim — same
  product/legal escalation as plan 046's STOP condition.
- Step 1 verification finds the VPAT landscape materially different from
  the outline (e.g. a new major template version restructuring the
  editions) — report; a rewrite of Section 2's structure is a planning
  decision.

## Maintenance notes

- Re-verify the VPAT version/editions whenever ITI ships a new template
  release, and bump the "Last reviewed" date on any edit.
- When plan 050's laws guide lands, add the Section-3 cross-links in both
  directions.
- If markdown mirrors / `llms-full.txt` happen (048's deferred idea),
  this guide is the strongest candidate to mirror first — it targets
  exactly the questions LLMs get asked.
