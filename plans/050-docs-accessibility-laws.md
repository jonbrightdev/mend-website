# Plan 050: Docs guide — "Accessibility laws and legal compliance"

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: confirm plan 048 landed —
> `src/components/DocsArticle.tsx` and `src/routes/docs/index.tsx` exist.
> If not, STOP (048 is a hard dependency). Check whether 049
> (`/docs/vpats-and-acrs`) landed — it only affects cross-links.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MEDIUM (static page, zero infra risk — but this is *legal
  subject matter*: a stale deadline or overclaimed obligation is worse
  than no page. The mitigations — execution-time verification, the
  disclaimer, the review date — are hard requirements, not polish)
- **Depends on**: 048 (docs foundation); 049 optional (cross-links)
- **Category**: content — user-requested (documentation initiative)
- **Planned at**: commit `9281534`, 2026-07-20

## Why this matters

"Is my website legally required to be accessible?" is the question that
brings most people to accessibility tooling, and the answer is scattered
across statutes, rulemaking, and vendor marketing that ranges from vague
to fear-mongering. A calm, plain-language map of the major laws — what
each covers, whom it binds, what technical standard it points at — is
genuinely useful documentation, strong search/LLM-answer material (the
Level Access inspiration), and the natural companion to the VPAT/ACR
guide: 049 explains the *document* buyers ask for, this explains the
*legal landscape* that makes them ask.

## Design decisions (settled — do not re-litigate)

- **Route**: `/docs/accessibility-laws`, via `DocsArticle` inside
  `MarketingShell` with `current="docs"` (the 048 idiom).
- **"Not legal advice" disclaimer is a hard requirement**, rendered
  prominently at the top of the article body (visible text near the lede,
  not a footnote) and echoed once at the end. It states: this is general
  educational information, not legal advice; laws and deadlines change;
  consult a lawyer for obligations specific to your organization and
  jurisdiction.
- **Every date, deadline, and threshold is verified at execution time.**
  The outline below reflects the planner's understanding as of 2026-07-20
  and exists so the executor knows what to verify — it is **not** copy to
  transcribe. Primary sources win: ada.gov (DOJ), section508.gov,
  EUR-Lex / the European Commission for the EAA, legislation.gov.uk /
  gov.uk for the UK, official government sources elsewhere. Where a fact
  can't be confirmed from a primary source, the guide omits it rather
  than hedging around it.
- **Calm, precise tone — no lawsuit-scare marketing.** Obligations are
  stated as what the law says, not as threats. Where the legal picture is
  genuinely unsettled (ADA Title III web standards), the guide says
  "unsettled" plainly instead of picking the scarier reading.
- **Honesty about tooling** (docs-wide rule from 048): the guide must say
  that these laws point at WCAG-based standards, that automated tools
  test a subset of WCAG, and that no tool — Mend included — makes a site
  "compliant" by itself. Mend appears only in one bounded closing
  section.
- **Jurisdiction scope for v1**: US (ADA Title II with the 2024 DOJ rule,
  ADA Title III, Section 508, a one-paragraph nod to state law), EU (EAA
  + EN 301 549 + the public-sector Web Accessibility Directive), UK
  (Equality Act 2010 + PSBAR 2018), then a compact "elsewhere" section
  (Canada: AODA + Accessible Canada Act; Australia: DDA). Nothing deeper
  in v1 — breadth kills accuracy.
- **"Last reviewed" date** set to the execution date; this page decays
  faster than anything else on the site.

## Current state

- Docs idioms from 048: `DocsArticle`, `/docs` index (this guide's entry
  may sit there as "coming soon"), `public/llms.txt` (this guide's line
  must end with a not-legal-advice note — 048's template already shows
  one).
- FAQ idiom: `details.reveal` accordions per `support.tsx`.
- Planner's factual understanding to verify (NOT copy): DOJ's April 2024
  final rule under ADA Title II requires WCAG 2.1 AA of state/local
  government web content and mobile apps, with compliance dates in April
  2026 (larger entities — **already passed** at planning time) and April
  2027 (smaller entities); Section 508 binds federal agencies and points
  at WCAG 2.0 AA via the 2017 refresh; the EAA (Directive (EU) 2019/882)
  has applied to in-scope products/services since 28 June 2025, with
  EN 301 549 as the presumption-of-conformity standard (WCAG 2.1 AA for
  web, with a revision in progress); the UK's PSBAR 2018 monitoring now
  references WCAG 2.2 AA; AODA requires WCAG 2.0 AA of in-scope Ontario
  organizations. Any of these may have moved — verify each.

## Commands you will need

| Purpose   | Command                                   | Expected |
|-----------|-------------------------------------------|----------|
| Routes    | `pnpm generate-routes`                    | regenerated |
| Typecheck | `pnpm typecheck`                          | exit 0   |
| Tests     | `pnpm test`                               | all pass |
| Lint/Build| `pnpm lint && pnpm build`                 | exit 0   |

## Scope

**In scope**:
- `src/routes/docs/accessibility-laws.tsx` — the guide
- `src/routes/docs/index.tsx` — link the entry (if 048 left it unlinked)
- `public/llms.txt` — confirm/fix this guide's line
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- Legal advice, risk scoring, "are you compliant?" quizzes/checkers
- Country-by-country coverage beyond the v1 jurisdiction list
- Litigation statistics or lawsuit-count content (dates instantly,
  invites fear-marketing tone)
- The VPAT/ACR guide (plan 049) — cross-link only
- New CSS, new components

## Git workflow

Work directly on `main`; commit e.g.
`Add the accessibility laws docs guide`. Do NOT push unless the operator
instructed it.

## Steps

### Step 1: Verify the legal facts

For each jurisdiction in scope, confirm from primary sources: what the
law is, whom it applies to, what technical standard it references, and
current deadlines/status. Build a scratch fact table with a source URL
per row before writing any copy. Facts without a primary source are cut,
not hedged. Note in the status row anything that contradicts the
"planner's factual understanding" list above.

### Step 2: Write the guide

`src/routes/docs/accessibility-laws.tsx` — head meta: title
"Accessibility laws, explained — Mend"; description ≤160 chars that
itself avoids legal-advice phrasing. Sections (h2s, in order):

1. **Disclaimer** (the hard-requirement copy, styled visibly — reuse an
   existing callout/panel class from `globals.css`; add no new CSS).
2. **Standards vs. laws.** WCAG is a technical standard, not a law; laws
   gain teeth by pointing at it (directly, or via EN 301 549 /
   Section 508). One short paragraph — it disarms the most common
   confusion and sets up every section that follows.
3. **United States.** Sub-sections (h3): *ADA Title II* (the 2024 DOJ
   rule: who, what standard, the verified deadline status — one deadline
   has likely already passed; say so plainly); *ADA Title III*
   (businesses open to the public; no web-specific standard has been
   codified, courts apply the ADA to websites unevenly — "unsettled",
   with WCAG conformance as the de-facto risk-reduction baseline);
   *Section 508* (federal agencies and what they buy — the procurement
   pull that makes vendors need ACRs; cross-link 049 if landed); *state
   law* (one paragraph: state analogues exist and can exceed federal
   requirements — no state-by-state table).
4. **European Union.** The EAA: what product/service categories it
   covers, the since-June-2025 application, member-state enforcement;
   EN 301 549 as the conformance presumption and its WCAG basis (as
   verified); the Web Accessibility Directive for public-sector bodies.
5. **United Kingdom.** Equality Act 2010 (services must make reasonable
   adjustments — applies to websites); PSBAR 2018 for public sector and
   the WCAG version its monitoring currently references (as verified).
6. **Elsewhere, briefly.** Canada (AODA, Accessible Canada Act),
   Australia (DDA). Two short paragraphs, closing with: most
   jurisdictions converge on WCAG — building to WCAG AA is the portable
   strategy.
7. **What complying actually involves.** Conformance to the referenced
   WCAG level across your content; the honesty passage — automated
   testing finds a subset of issues fast and repeatably, manual/AT
   testing covers the rest; accessibility statements/feedback channels
   where required; conformance documentation for procurement (cross-link
   049 if landed).
8. **How Mend fits** (bounded): free on-device audits against WCAG
   2.0/2.1/2.2; the dashboard's history/monitoring for keeping evidence
   current (mention monitors only if 043+ landed); the automated-
   assessment VPAT report if 046 landed — each with the no-tool-makes-
   you-compliant caveat restated.
9. **FAQ** (`details.reveal`, 4–6 entries): Does the ADA apply to my
   website? Which WCAG version/level should I target? Is an overlay
   widget enough? (No — and keep the tone factual, not competitor-
   bashing.) What's the difference between the EAA and EN 301 549? Do
   small businesses have obligations?
10. **Closing note**: the disclaimer echo plus plain-text pointers to the
    primary sources used (ada.gov, section508.gov, the EAA on EUR-Lex,
    gov.uk) so readers can verify for themselves.

Heading hierarchy strict (one h1 via `DocsArticle`, h2 sections, h3
inside §3 only); `section--tight`/`reveal` idioms per 048.

### Step 3: Wire up

Link from the `/docs` index (replace "coming soon"); confirm the
`public/llms.txt` line (must carry the not-legal-advice note). If 049 is
live, add its Section-3 cross-link back to this guide.
`pnpm generate-routes`.

### Step 4: Full gate

`pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
→ all exit 0. Manual: `pnpm dev`; read the whole page checking every date
against the Step 1 fact table; check heading order and FAQ keyboard
access; confirm the disclaimer is visible without scrolling past the fold
on a laptop viewport.

## Done criteria

- [ ] Step 1 fact table built; every date/standard in the page traces to
      a primary source; discrepancies vs. the plan noted in the status row
- [ ] Disclaimer present top and bottom; "Last reviewed" date rendered
- [ ] Guide renders at `/docs/accessibility-laws`; heading hierarchy clean
- [ ] Honesty-about-tooling passage present in §7 and §8 (grep the source)
- [ ] No litigation statistics, no scare copy, no state-by-state or
      country-by-country tables beyond the v1 scope
- [ ] Index + llms.txt link the live guide
- [ ] Full gate exits 0; no out-of-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 048 has not landed (no `DocsArticle` / `/docs` index).
- Step 1 verification reveals a major in-scope legal change this plan's
  structure doesn't anticipate (e.g. a codified ADA Title III web rule) —
  that reshapes §3; report rather than improvise structure.
- Anyone asks to remove/soften the disclaimer, to add "compliance
  guaranteed"-flavored copy, or to state legal conclusions ("you are/are
  not liable") — product/legal escalation, same as 046/049.
- A fact the outline treats as load-bearing (e.g. the EAA application
  date) cannot be confirmed from a primary source — report; don't ship
  the section without it.

## Maintenance notes

- This page needs a standing re-review cadence — at minimum when the
  remaining ADA Title II deadline passes (April 2027 per current
  understanding), when EN 301 549's revision publishes, and yearly
  otherwise. Bump "Last reviewed" on every touch; a founder-side
  reminder (calendar or scheduled agent) is worth setting up when this
  lands.
- If a reader-reported correction arrives, treat it like a bug: verify
  against a primary source, fix, bump the date.
- Deeper per-jurisdiction pages (a dedicated EAA guide is the likeliest
  ask) should be new docs articles linked from §4 — don't grow this page
  past a single readable sitting.
