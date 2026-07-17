# Plan 026: Expand the hand-written rule catalogue to cover what actually arrives

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat cb1bec2..HEAD -- src/lib/dashboard-data.ts`
> If the `RULES` record or `WCAG_SLUGS` changed since this plan was written,
> re-derive the gap list in Step 1 before writing entries; treat structural
> changes (different `RuleSpec` fields) as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (content-heavy, code-light)
- **Risk**: LOW (additive data; worst failure is inaccurate copy)
- **Depends on**: none
- **Category**: content / product
- **Planned at**: commit `cb1bec2`, 2026-07-17

## Why this matters

The details page's fix guidance comes from the hand-written `RULES` record in
`src/lib/dashboard-data.ts` — currently **14 entries**. But the extension
runs axe-core with the `wcag2a`/`wcag2aa`(/`wcag2aaa`) tags plus
`best-practice` (and `experimental` on deep scans) — see `axeRunOnlyTags` in
`../mend-a11y/src/lib/normalize.ts:224-241` — so dozens of rule ids can
arrive. Unknown rules fall back to `ruleSpecFor`'s generic copy ("Mend
doesn't have a hand-written fix for this rule yet"), which is exactly the
moment the product is supposed to shine: the user is on the details page
wanting the fix.

The extension's own docs registry (`../mend-a11y/src/docs/index.ts`, 15
entries) is the floor: a rule the extension documents in its side panel but
the portal shrugs at is visible inconsistency between the two halves of the
same product.

## Current state

- `src/lib/dashboard-data.ts:96-251` — `RULES: Record<string, RuleSpec>` with
  14 entries: `image-alt`, `label`, `button-name`, `aria-required-attr`,
  `color-contrast`, `link-name`, `html-has-lang`, `document-title`,
  `heading-order`, `region`, `landmark-one-main`, `list`, `duplicate-id`,
  `image-redundant-alt`.
- `RuleSpec` (`:56-67`): `impact`, `help`, `helpUrl`, `description`, `fix`,
  optional `before`/`after`, `wcag`, `tags`. Every existing entry has
  `before`/`after`; keep that bar.
- `WCAG_SLUGS` (`:72-81`) maps SC numbers → W3C Understanding slugs; the
  details page renders plain text when `wcagUnderstandingUrl` returns null.
- `helpUrl` convention: `https://dequeuniversity.com/rules/axe/4.10/<ruleId>`.
- Extension docs registry keys (15): the 14 above **minus** `label`,
  `region`, `list`, `image-redundant-alt`, **plus** `empty-heading`,
  `nested-interactive`, `aria-valid-attr-value`, `meta-viewport`,
  `frame-title`.
- `src/lib/dashboard-data.test.ts` exists — extend it, don't create a
  parallel file.

## The gap to close

**Tier 1 — extension parity (required):** add these 5, so every rule the
extension documents is documented here too:

| ruleId | impact | WCAG |
|---|---|---|
| `empty-heading` | minor | best-practice (1.3.1-adjacent) |
| `nested-interactive` | serious | 4.1.2 Name, Role, Value (A) |
| `aria-valid-attr-value` | critical | 4.1.2 Name, Role, Value (A) |
| `meta-viewport` | critical | 1.4.4 Resize text (AA) |
| `frame-title` | serious | 4.1.2 Name, Role, Value (A) |

**Tier 2 — high-frequency axe rules (required):** add these 10, chosen for
how often they fire on real pages under the tags the extension runs:

| ruleId | impact | WCAG |
|---|---|---|
| `select-name` | critical | 4.1.2 (A) |
| `input-image-alt` | critical | 1.1.1 (A) |
| `aria-allowed-attr` | critical | 4.1.2 (A) |
| `aria-hidden-focus` | serious | 4.1.2 (A) |
| `meta-refresh` | critical | 2.2.1 Timing Adjustable (A) |
| `tabindex` | serious | best-practice |
| `scrollable-region-focusable` | serious | 2.1.1 Keyboard (A) |
| `link-in-text-block` | serious | 1.4.1 Use of Color (A) |
| `page-has-heading-one` | moderate | best-practice |
| `autocomplete-valid` | serious | 1.3.5 Identify Input Purpose (AA) |

Impact values above are axe-core's; **verify each against the deque
helpUrl page while writing the entry** — if deque says otherwise, deque wins
and note it in the commit message.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |
| Dev run   | `pnpm dev`       | serves on :3000     |

## Scope

**In scope** (the only files you should modify/create):
- `src/lib/dashboard-data.ts` (`RULES` entries + `WCAG_SLUGS` additions)
- `src/lib/dashboard-data.test.ts` (catalogue invariants)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `ruleSpecFor` and every compute helper — the fallback behaviour stays; it
  now just fires for rarer rules.
- The extension repo (`../mend-a11y`) — read-only reference for this plan.
- Details-page components — the data drives them unchanged.
- Restructuring `RULES` (moving to JSON, splitting files). 25–30 inline
  entries is fine.

## Git workflow

Work directly on `main` (per CLAUDE.md). Commit style: short imperative
sentence, e.g. "Document 15 more axe rules in the fix catalogue". Run the
full CI check list before pushing.

## Steps

### Step 1: Re-derive the gap

Confirm the current `RULES` keys and the extension's docs keys still match
the lists above:

```
grep -oE '^  "[a-z-]+"' src/lib/dashboard-data.ts
grep -oE "^  '[a-z-]+'" ../mend-a11y/src/docs/index.ts
```

Adjust the Tier-1 list if the extension gained/lost entries.

### Step 2: Extend `WCAG_SLUGS`

The new entries reference criteria the slug map lacks. Add (verify each slug
resolves — the pattern is
`https://www.w3.org/WAI/WCAG21/Understanding/<slug>.html`):

```
"1.3.5": "identify-input-purpose",
"1.4.1": "use-of-color",
"1.4.4": "resize-text",
"2.1.1": "keyboard",
"2.2.1": "timing-adjustable",
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Write the 15 entries

For each rule in Tiers 1 and 2, add a `RULES` entry matching the existing
house style exactly:

- `help`/`description`: use axe-core's own strings (they're on the deque
  page) — do not paraphrase; the ingest pipeline sends axe's strings, and the
  details page should agree with them.
- `fix`: 1–2 sentences, imperative, concrete — match the register of the
  existing 14 (read three before writing one).
- `before`/`after`: minimal HTML pair that actually demonstrates the failure
  and the fix. Required for every new entry.
- `wcag`: full labels in the existing format, e.g.
  `"2.2.1 Timing Adjustable (A)"`. Best-practice-only rules get `wcag: []`
  and a `best-practice` tag (precedent: `heading-order`, `region`).
- `tags`: mirror axe's tags like the existing entries do
  (`wcag2a`/`wcag2aa`, `wcagXXX` number, `cat.*`, `best-practice`).
- Where the extension's docs registry (`../mend-a11y/src/docs/index.ts`) has
  an entry for the rule, read it first and keep the advice *consistent* with
  it (not identical copy — consistent guidance).

Keep entries ordered by impact then alphabetically, matching how the current
record reads (critical → serious → moderate → minor).

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Pin catalogue invariants in tests

Extend `src/lib/dashboard-data.test.ts` with a describe block iterating
`Object.entries(RULES)`:

1. Every entry has non-empty `help`, `description`, `fix`.
2. Every entry has both `before` and `after`.
3. `helpUrl` matches `^https://dequeuniversity\.com/rules/axe/4\.10/<key>$`.
4. Every `wcag` label resolves: `wcagUnderstandingUrl(label)` is non-null
   (this is what forces Step 2 to be complete).
5. Rule count ≥ 29 (14 + 15) — a floor, not an exact match.

**Verify**: `pnpm test` → all pass.

### Step 5: Eyeball one page

`pnpm dev`, open an audit's details page for a rule you added (seed one via
the ingest test payload shape if needed) and confirm the hand-written fix,
before/after, and WCAG links render — links resolve to real W3C pages
(spot-check two in the browser).

## Test plan

Step 4's invariants plus the existing suite. The invariants are the lasting
value: any future entry that forgets a slug or typos a helpUrl fails CI.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0, including the new invariant block
- [ ] All 5 Tier-1 rule ids present in `RULES` (grep each)
- [ ] All 10 Tier-2 rule ids present in `RULES` (grep each)
- [ ] Every new entry has `before` and `after`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `RuleSpec` has changed shape since the excerpt (new required fields, moved
  file) — re-plan the entry template first.
- You cannot verify a rule's impact/WCAG mapping against its deque page
  (offline, page moved) — write the entries you can verify, list the ones
  you couldn't, and stop rather than guessing conformance data on an
  accessibility product.
- You're inclined to restructure `RULES` into separate files or JSON — out of
  scope; note it and continue inline.

## Maintenance notes

- The catalogue will never cover all of axe (~100 rules); the generic
  fallback remains correct behaviour. The bar is: every rule the extension
  documents, plus everything that shows up commonly, has real guidance.
- When axe's major version in `helpUrl` changes (extension dependency bump),
  the URL pattern in the invariant test is the single place that flags it.
- Candidate next tier when someone asks again: `svg-img-alt`,
  `role-img-alt`, `aria-required-children`, `aria-required-parent`,
  `definition-list`, `dlitem`, `listitem`, `th-has-data-cells`.
