/* ============================================================
   Renders a VpatReportData into one self-contained HTML
   document: inline CSS, no external requests, printable. Pure
   string work — no database, no framework, safe on either side.

   The honesty copy in METHODOLOGY_COPY is a product requirement,
   not decoration. An automated scan cannot establish conformance,
   and every claim this document makes is scoped to what axe-core
   actually checked. Do not soften or remove it.
   ============================================================ */

import type { VpatFinding, VpatReportData, VpatRow } from "@/lib/vpat-data";

export const REPORT_SUBTITLE =
  "Automated assessment (VPAT® 2.5 format) · WCAG 2.2 edition";

export const METHODOLOGY_COPY = [
  "Results in this report come from automated accessibility scans performed by Mend using axe-core, an open-source rules engine. Each page listed above was evaluated on the date shown.",
  "Automated testing cannot verify every aspect of a success criterion. It reliably detects a subset of failures — missing alternative text, insufficient contrast, unnamed controls — and cannot assess meaning, context, or the experience of using assistive technology. A criterion marked “Supports” means only that the automated checks found no failures; it is not a statement that the criterion is fully met.",
  "A complete conformance claim requires manual evaluation by a qualified assessor, including keyboard-only testing, screen-reader testing, and human judgement about content. This document is intended as evidence of ongoing automated monitoring and as a starting point for that work, not as a substitute for it.",
];

export const TRADEMARK_FOOTNOTE =
  "VPAT® is a registered trademark of the Information Technology Industry Council (ITI). This report follows the structure of the VPAT 2.5 WCAG edition. It is not produced, endorsed, or certified by ITI.";

const CONFORMANCE_NOTE: Record<VpatRow["conformance"], string> = {
  Supports: "No issues detected by automated checks.",
  "Partially Supports": "Automated checks found issues on some evaluated pages:",
  "Does Not Support": "Automated checks found issues on every evaluated page:",
};

/**
 * Escapes text for interpolation into HTML. Everything in this document that
 * originates outside our own source — the product name a user typed, page URLs
 * and titles, and rule help text ingested from a scanner — goes through here.
 */
export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function findingLine(f: VpatFinding): string {
  const pages = f.pageCount === 1 ? "1 page" : `${f.pageCount} pages`;
  const instances = f.nodeCount === 1 ? "1 instance" : `${f.nodeCount} instances`;
  return `<li><strong>${esc(f.ruleId)}</strong> — ${esc(f.help)} (${instances} across ${pages})</li>`;
}

function remarks(row: VpatRow): string {
  const note = `<p>${CONFORMANCE_NOTE[row.conformance]}</p>`;
  if (row.findings.length === 0) return note;
  return `${note}<ul>${row.findings.map(findingLine).join("")}</ul>`;
}

function criteriaTable(rows: VpatRow[], level: "A" | "AA"): string {
  const body = rows
    .filter((r) => r.criterion.level === level)
    .map(
      (r) => `<tr>
<th scope="row">${esc(r.criterion.sc)} ${esc(r.criterion.name)}</th>
<td>${r.conformance}</td>
<td>${remarks(r)}</td>
</tr>`,
    )
    .join("\n");
  return `<table>
<caption>Table ${level === "A" ? "1" : "2"}: Success Criteria, Level ${level}</caption>
<thead><tr><th scope="col">Criteria</th><th scope="col">Conformance Level</th><th scope="col">Remarks and Explanations</th></tr></thead>
<tbody>
${body}
</tbody>
</table>`;
}

// System fonts and plain black-on-white: the document must render identically
// with no network access, and survive print-to-PDF, which is the user's PDF
// path — we deliberately ship no PDF library.
const STYLES = `
:root { color-scheme: light; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #111; background: #fff; margin: 0 auto; max-width: 60rem; padding: 2.5rem 1.5rem 4rem; line-height: 1.55; }
h1 { font-size: 1.9rem; margin: 0 0 .3rem; }
h2 { font-size: 1.25rem; margin: 2.5rem 0 .75rem; border-bottom: 2px solid #111; padding-bottom: .3rem; }
.subtitle { font-size: 1rem; color: #444; margin: 0 0 .2rem; }
.generated { color: #444; margin: 0 0 2rem; }
table { border-collapse: collapse; width: 100%; margin: 0 0 1.5rem; }
caption { text-align: left; font-weight: 700; padding: .6rem 0; }
th, td { border: 1px solid #999; padding: .55rem .7rem; text-align: left; vertical-align: top; }
thead th { background: #f0f0f0; }
tbody th { font-weight: 600; width: 22%; }
td:nth-child(2) { width: 15%; white-space: nowrap; }
td p { margin: 0 0 .4rem; }
td ul { margin: 0; padding-left: 1.1rem; }
li { margin-bottom: .25rem; }
.note { border: 1px solid #999; border-left: 5px solid #111; padding: .9rem 1.1rem; margin: 0 0 1.5rem; }
.note p:last-child { margin-bottom: 0; }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #999; color: #444; font-size: .85rem; }
@media print {
  body { max-width: none; padding: 0; font-size: 10.5pt; }
  h2 { break-after: avoid; }
  tr { break-inside: avoid; }
}
`;

/** The whole report as one HTML document. */
export function renderVpatHtml(data: VpatReportData): string {
  const pageRows = data.pages
    .map(
      (p) =>
        `<tr><td>${esc(p.pageTitle)}</td><td>${esc(p.url)}</td><td>${fmtDate(p.scannedAt)}</td></tr>`,
    )
    .join("\n");

  const pageCount = data.pages.length;
  const basis = `${pageCount} ${pageCount === 1 ? "page" : "pages"}, automated scans via Mend (axe-core)`;

  const appendix =
    data.unmapped.length === 0
      ? ""
      : `<h2>Appendix: findings not mapped to a Level A or AA criterion</h2>
<p>These automated findings carry no WCAG 2.2 Level A or AA success criterion — they are best-practice checks, Level AAA criteria, or criteria removed from WCAG 2.2. They are listed for completeness and do not affect any determination above.</p>
<ul>${data.unmapped.map(findingLine).join("")}</ul>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.productName)} — Accessibility Conformance Report</title>
<style>${STYLES}</style>
</head>
<body>
<h1>${esc(data.productName)} — Accessibility Conformance Report</h1>
<p class="subtitle">${REPORT_SUBTITLE}</p>
<p class="generated">Generated ${fmtDate(data.generatedAt)}</p>

<h2>Report information</h2>
<table>
<caption>Report metadata</caption>
<tbody>
<tr><th scope="row">Product or site</th><td>${esc(data.productName)}</td></tr>
<tr><th scope="row">Report date</th><td>${fmtDate(data.generatedAt)}</td></tr>
<tr><th scope="row">Contact</th><td>${esc(data.contactEmail)}</td></tr>
<tr><th scope="row">Evaluation basis</th><td>${basis}</td></tr>
<tr><th scope="row">Standard</th><td>Web Content Accessibility Guidelines (WCAG) 2.2, Level A and Level AA</td></tr>
</tbody>
</table>

<h2>Pages evaluated</h2>
<table>
<caption>The most recent automated scan of each page covered by this report</caption>
<thead><tr><th scope="col">Page</th><th scope="col">URL</th><th scope="col">Last scanned</th></tr></thead>
<tbody>
${pageRows}
</tbody>
</table>

<h2>Evaluation methods and limitations</h2>
<div class="note">
${METHODOLOGY_COPY.map((p) => `<p>${p}</p>`).join("\n")}
</div>

<h2>WCAG 2.2 Report</h2>
${criteriaTable(data.rows, "A")}
${criteriaTable(data.rows, "AA")}

${appendix}

<footer>
<p>${TRADEMARK_FOOTNOTE}</p>
<p>Success criteria and their titles are taken from the W3C Web Content Accessibility Guidelines (WCAG) 2.2 Recommendation.</p>
</footer>
</body>
</html>
`;
}
