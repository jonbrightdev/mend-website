# Plan 046: On-demand VPAT-format Accessibility Conformance Report

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a0f7690..HEAD -- src/lib/export-data.ts src/routes/api src/lib/dashboard-queries.ts`
> This plan is independent of the monitoring generation (043–045) — it reads
> the existing `audit`/`violation` tables only. If the tag format described
> under "Current state" no longer holds, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW-MEDIUM (no infra; the risk is *correctness of claims* — the
  report's wording must never overstate what automated scanning proves)
- **Depends on**: none (better with more audit data; monitoring 043–045
  feeds it but is not required)
- **Category**: feature — user-requested
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

Users increasingly get asked by procurement for a VPAT/ACR — a per-WCAG-
criterion conformance table. All the raw material is already in the
database: every violation row carries dotted WCAG SC numbers in `tags`
(e.g. `"1.4.3"`), and the dashboard already computes "latest run per URL".
Generating a **VPAT 2.5-format** report on demand turns Mend's audit data
into a document users can actually hand to a buyer — with honest,
automated-assessment framing.

## Design decisions (settled — do not re-litigate)

- **Edition**: WCAG 2.2 tables, Level A and Level AA only (the extension
  emits `wcag22*` tags; AAA is out of scope for the product's promise).
- **Data basis**: the **latest run per URL** for the user (the dashboard's
  existing semantics), across all their audited pages. No page picker in v1.
- **Determination per criterion** (deterministic, no AI):
  - findings on **all** audited pages → **Does Not Support**
  - findings on **some** pages → **Partially Supports**
  - findings on **no** pages → **Supports** — *always* paired with the
    methodology caveat (below), because axe-core checks a subset of each SC.
  - `4.1.1 Parsing` → **Not Applicable** with the remark "Removed in WCAG
    2.2." if the catalogue includes it; simpler: omit it (see Step 1).
- **Honesty framing is a hard requirement.** The report titles itself
  "Accessibility Conformance Report — automated assessment (VPAT® 2.5
  format)", the Evaluation Methods section states that results come from
  automated axe-core scans of N pages on date X and that automated testing
  cannot verify every aspect of a criterion — manual evaluation is required
  for a full conformance claim. A footnote notes VPAT is a registered
  trademark of the Information Technology Industry Council (ITI). None of
  this copy is optional.
- **Output**: an authed preview page `/vpat` (form: product/site name,
  defaulting to the audited hostnames joined; contact defaults to the
  account email) and a downloadable **standalone HTML file** via
  `GET /api/vpat` (self-contained inline CSS, printable — print-to-PDF is
  the user's PDF path; we do not add a PDF library).
- **The LLM explains nothing here** — there is no LLM. (har-analyzer's rule:
  deterministic engines make claims; nothing generative touches a
  compliance document.)

## Current state

- `violation.tags` (`src/db/schema.ts:109-128`) — per grouped rule:
  `[category?, ...wcag]` where wcag entries are dotted SC strings
  (`"1.4.3"`), produced by `groupViolations`
  (`src/lib/ingest-payload.ts`) from the extension's `wcagFromTags`
  (`../mend-a11y/src/lib/normalize.ts:107-116` — regex
  `^wcag(\d)(\d)(\d+)$` → `"d.d.d+"`). Category strings never match
  `^\d\.\d\.\d+$`, so filtering tags by that regex yields exactly the SCs.
- Latest-run-per-URL: `getDashboardData` in `src/lib/dashboard-queries.ts`
  already implements it — read it and mirror the query shape (do not import
  the whole dashboard payload; the report needs
  url/pageTitle/scannedAt + per-violation ruleId/impact/help/tags/node
  counts).
- Download-route idiom: the JSON export (`src/lib/export-data.ts` behind a
  `GET /api/export` route) — session-authed, `Content-Disposition:
  attachment`. Find the route with `grep -rn "buildExport" src/routes` and
  copy its auth/headers pattern.
- UI idioms: `MarketingShell`, `panel` sections, `data` tables; nav union
  `NavPage` in `SiteHeader.tsx` (plan 043 adds `"monitors"`; this plan does
  **not** add a nav item — the entry point is a link/button on the dashboard
  app-head area and on `/account`, see Step 4).

## Commands you will need

| Purpose   | Command                                   | Expected |
|-----------|-------------------------------------------|----------|
| Routes    | `pnpm generate-routes`                    | regenerated |
| Typecheck | `pnpm typecheck`                          | exit 0   |
| Tests     | `pnpm test`                               | all pass |
| Lint/Build| `pnpm lint && pnpm build`                 | exit 0   |

## Scope

**In scope**:
- `src/lib/wcag-criteria.ts` (+test) — static WCAG 2.2 A/AA catalogue
- `src/lib/vpat-data.ts` (+test) — queries + determination algorithm
- `src/lib/vpat-render.ts` (+test) — standalone-HTML renderer (pure string)
- `src/lib/vpat-fns.ts` — server fn for the preview page
- `src/routes/vpat.tsx` + `src/components/VpatClient.tsx` (+jsdom test)
- `src/routes/api/vpat.ts` — the download route
- Entry-point links: `DashboardClient.tsx` app-head + `AccountClient.tsx`
  (one line each)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- PDF generation, DOCX, the official ITI .doc template
- Section 508 / EN 301 549 tables (WCAG-only edition)
- Any schema change; any LLM anything
- Per-page or per-date-range scoping (v1 is whole-account, latest runs)

## Git workflow

Work directly on `main`; commit e.g.
`Generate a VPAT-format accessibility conformance report on demand`.
Do NOT push unless the operator instructed it.

## Steps

### Step 1: The criteria catalogue

`src/lib/wcag-criteria.ts`:

```ts
export interface WcagCriterion {
  sc: string;            // "1.4.3"
  name: string;          // "Contrast (Minimum)"
  level: "A" | "AA";
}
export const WCAG_22_CRITERIA: WcagCriterion[]
```

Transcribe from the W3C WCAG 2.2 quick reference (verify against
https://www.w3.org/TR/WCAG22/ — do not trust memory): all Level A and Level
AA criteria of WCAG 2.2. Expected counts — **A: 31** (2.1's 30, plus 3.2.6
Consistent Help and 3.3.7 Redundant Entry, minus 4.1.1 Parsing) and
**AA: 24** (2.1's 20, plus 2.4.11 Focus Not Obscured (Minimum), 2.5.7
Dragging Movements, 2.5.8 Target Size (Minimum), 3.3.8 Accessible
Authentication (Minimum)). 4.1.1 is omitted entirely (it no longer exists
in 2.2; old audits carrying a `4.1.1` tag are surfaced via the "unmapped
findings" appendix below rather than a dedicated row).

Test: assert the counts above, uniqueness of `sc`, and spot-check five
well-known rows (1.1.1/A, 1.4.3/AA, 2.4.7/AA, 2.5.8/AA, 3.3.7/A). If the
executor's verification against the W3C list contradicts a count here, the
W3C list wins — fix the test and note it in the status row.

### Step 2: Data + determination

`src/lib/vpat-data.ts` (server-only header comment):

```ts
export interface VpatFinding { ruleId: string; help: string; impact: Impact;
  pageCount: number; nodeCount: number }
export interface VpatRow { criterion: WcagCriterion;
  conformance: "Supports" | "Partially Supports" | "Does Not Support";
  findings: VpatFinding[] }   // empty for Supports
export interface VpatReportData {
  productName: string; contactEmail: string; generatedAt: string;
  pages: { url: string; scannedAt: string }[];   // the latest runs used
  rows: VpatRow[];                                // catalogue order
  unmapped: VpatFinding[];  // findings whose tags contain no catalogued SC
}
export async function buildVpatData(userId: string, productName: string): Promise<VpatReportData | null>
```

Returns `null` when the user has zero audits (the UI explains you need at
least one). Algorithm: load latest run per URL + their violations; for each
violation, `scs = tags.filter(t => /^\d\.\d\.\d+$/.test(t))` intersected
with the catalogue; attribute the violation's page and node count to each
matched SC; violations matching *no* catalogued SC (category-only tags, AAA
SCs, `4.1.1`) aggregate into `unmapped`. Conformance per the settled rule
(all pages / some pages / none — "pages" = the latest-run URL set).

Tests (PGlite): a two-page fixture where rule X (tag `1.1.1`) hits both
pages → Does Not Support; rule Y (tag `1.4.3`) hits one → Partially
Supports; an untagged violation → `unmapped`; SC untouched → Supports with
empty findings; zero audits → null; other users' audits invisible; only the
**latest** run per URL counts (an old run's fixed violation must not
downgrade a criterion).

### Step 3: Renderer

`src/lib/vpat-render.ts`: `renderVpatHtml(data: VpatReportData): string` —
one self-contained document: `<!doctype html>`, inline CSS (system font
stack, black-on-white, print-friendly, no external requests), sections:

1. Title: "{productName} — Accessibility Conformance Report", subtitle
   "Automated assessment (VPAT® 2.5 format) · WCAG 2.2 edition", date.
2. Report metadata table (product, date, contact, evaluation basis:
   "N pages, automated scans via Mend (axe-core)"; the page list with scan
   dates).
3. **Methodology & limitations** — the settled honesty copy verbatim
   (Design decisions above), rendered prominently, not as a footnote.
4. Table 1: Success Criteria Level A; Table 2: Level AA. Columns:
   Criteria (sc + name), Conformance Level, Remarks and Explanations
   (findings as "rule — help (nodeCount instances across pageCount
   pages)"; Supports rows: "No issues detected by automated checks.").
5. Appendix: unmapped findings (if any) + the ITI trademark footnote.

All user data (`productName`, urls, rule help text, page titles) must be
HTML-escaped — write a tiny `esc()` and use it everywhere; test that
`<script>` in a productName/help string comes out escaped.

Tests: snapshot-free assertions — contains both tables, row count matches
catalogue, escaping case, no `http`-sourced asset references
(`/src=|href="http/` grep-style assertion apart from the single W3C
reference link, which should be plain text or acceptable).

### Step 4: Routes + UI

- `src/routes/api/vpat.ts` — GET; session auth exactly like the export
  route; `?name=` query (clipped to 200 chars, default: audited hostnames
  joined with ", "); `buildVpatData` → 404-style JSON if null; else
  `renderVpatHtml` with `Content-Type: text/html` and
  `Content-Disposition: attachment; filename="vpat-<date>.html"`.
- `src/routes/vpat.tsx` + `VpatClient.tsx` — authed preview: name input,
  "Download report" anchor to `/api/vpat?name=…`, and an on-page preview of
  the determination table (reuse `VpatRow` data via `vpat-fns.ts`
  `fetchVpatPreview`; render with existing `panel`/`data` classes — do
  *not* iframe the standalone HTML). Zero-audit state explains the
  prerequisite and links to `/monitors` (if 043 landed) or `/account`.
- Entry points: on `/account`, a short "Reports" line linking to `/vpat`;
  on the dashboard app-head, a ghost link "VPAT report" (sits fine next to
  plan 042's conditional connect button).
- `pnpm generate-routes`.

Component test (jsdom): preview renders rows from mocked data; download
link carries the encoded name.

### Step 5: Full gate

`pnpm generate-routes && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
→ all exit 0. Manual: `pnpm dev`, seed an audit (extension or fixture
insert), download the file, open it, print-preview it.

## Done criteria

- [ ] Catalogue test passes with counts verified against the W3C list
- [ ] Determination covered by the Step 2 test matrix; escaping test passes
- [ ] Downloaded file is a single self-contained HTML document that renders
      with no network access
- [ ] Methodology/limitations copy present in the output (grep the renderer
      test for it)
- [ ] Full gate exits 0; no out-of-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- The tag format assumption fails (violations whose wcag tags are not
  dotted `d.d.d+` strings appear in real data) — the mapping layer is the
  foundation; report before improvising.
- The export route's auth pattern has changed in a way that doesn't
  transplant (e.g. plan 025's route was reworked).
- Anyone (including the operator, mid-execution) asks to soften or remove
  the automated-assessment caveats — that is a product/legal decision above
  this plan; stop and surface it.

## Maintenance notes

- When monitoring (043–045) is live, daily runs keep the report's "latest
  runs" fresh automatically — the feature compounds; no code coupling
  exists.
- Adding EN 301 549 / Section 508 tables later = new sections in
  `vpat-render.ts` + catalogue entries; the determination core is
  edition-agnostic.
- If the extension ever emits WCAG 2.x-version metadata per issue, the
  report could split "new in 2.2" rows; today all SCs are treated uniformly.
- The name input is the only free-text user input in the document — the
  `esc()` discipline matters most there and in ingested rule help/html.
