/* ============================================================
   axe results → the flat IngestIssue shape the extension sends.

   These helpers deliberately mirror ../mend-a11y/src/lib/normalize.ts
   (wcagFromTags, the cat.* category map, the minor-impact fallback,
   the 500-char html clip) rather than importing across repos. Both
   scanners feed the same dashboard, so they must speak the same
   vocabulary — if you change a mapping here, change it there too.

   Pure: no db, no browser, no network.
   ============================================================ */

import type { IngestIssue } from "@/lib/ingest-payload";
import type { Impact } from "@/lib/dashboard-data";

// The subset of an axe result this module reads. Declared structurally rather
// than imported from axe-core's types so the pure normalizer (and its tests)
// never pull the engine in.
export interface AxeNode {
  target: string[];
  html: string;
  failureSummary?: string;
  impact?: string | null;
}

export interface AxeViolation {
  id: string;
  impact?: string | null;
  tags: string[];
  help: string;
  description: string;
  helpUrl?: string;
  nodes: AxeNode[];
}

// The extension clips snippets at 500 chars before sending; matching it keeps
// stored html identical for the same finding from either scanner.
const HTML_CLIP = 500;

const TAG_CATEGORY: Record<string, string> = {
  "cat.color": "contrast",
  "cat.forms": "forms",
  "cat.keyboard": "keyboard",
  "cat.text-alternatives": "images",
  "cat.structure": "structure",
  "cat.semantics": "structure",
  "cat.language": "structure",
  "cat.aria": "aria",
  "cat.name-role-value": "aria",
};

export function categorize(tags: string[]): string {
  for (const tag of tags) {
    const mapped = TAG_CATEGORY[tag];
    if (mapped) return mapped;
  }
  return "other";
}

/** axe tag "wcag143" → "1.4.3". Sorted and de-duplicated, numeric-aware. */
export function wcagFromTags(tags: string[]): string[] {
  const set = new Set<string>();
  for (const tag of tags) {
    const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
    if (m?.[1] && m[2] && m[3]) set.add(`${m[1]}.${m[2]}.${m[3]}`);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// axe leaves impact null on some nodes; the extension falls back to "minor"
// rather than dropping the finding, and so do we.
export function toImpact(value: string | null | undefined): Impact {
  return value === "critical" || value === "serious" || value === "moderate" || value === "minor"
    ? value
    : "minor";
}

/** Collapse the engine's multi-line failure text into a single readable line. */
function cleanSummary(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * One flat issue per affected element, which is what /api/ingest expects —
 * grouping back into per-rule violations happens once, in groupViolations.
 */
export function axeToIssues(violations: AxeViolation[]): IngestIssue[] {
  const issues: IngestIssue[] = [];
  let domOrder = 0;

  for (const violation of violations) {
    const wcag = wcagFromTags(violation.tags);
    const category = categorize(violation.tags);
    const helpUrl = violation.helpUrl || undefined;

    for (const node of violation.nodes) {
      const summary = node.failureSummary ? cleanSummary(node.failureSummary) : undefined;
      issues.push({
        ruleId: violation.id,
        // Node impact is the more specific of the two; the violation's is the
        // aggregate. Prefer the node, fall back, then default to minor.
        impact: toImpact(node.impact ?? violation.impact),
        category,
        wcag,
        title: violation.help,
        description: violation.description,
        helpUrl,
        // " > " matches the extension's join. The dashboard shows selectors
        // from both scanners in one table, so the separator must agree.
        selector: node.target.join(" > "),
        html: node.html.slice(0, HTML_CLIP),
        failureSummary: summary,
        domOrder: domOrder++,
      });
    }
  }

  return issues;
}
