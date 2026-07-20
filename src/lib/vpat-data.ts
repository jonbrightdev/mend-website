/* ============================================================
   Server-only report builder: turns stored audits into the rows
   of an Accessibility Conformance Report. Imports the database —
   never import this from client-reachable code; go through
   src/lib/vpat-fns.ts instead.

   Deterministic by design. Nothing generative touches a document
   a user may hand to a buyer.
   ============================================================ */

import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { audit, violation } from "@/db/schema";
import type { Impact } from "@/lib/dashboard-data";
import { WCAG_22_BY_SC, WCAG_22_CRITERIA, type WcagCriterion } from "@/lib/wcag-criteria";

// The extension's wcagFromTags emits dotted success-criterion numbers
// ("1.4.3"); category tags ("cat.forms", "wcag2aa") never match this shape, so
// the filter yields exactly the criteria a violation maps to.
const SC_TAG = /^\d+\.\d+\.\d+$/;

export type Conformance = "Supports" | "Partially Supports" | "Does Not Support";

export interface VpatFinding {
  ruleId: string;
  help: string;
  impact: Impact;
  pageCount: number;
  nodeCount: number;
}

export interface VpatRow {
  criterion: WcagCriterion;
  conformance: Conformance;
  findings: VpatFinding[]; // empty when the conformance is "Supports"
}

export interface VpatPage {
  url: string;
  pageTitle: string;
  scannedAt: string; // ISO datetime of the run used
}

export interface VpatReportData {
  productName: string;
  contactEmail: string;
  generatedAt: string; // ISO datetime
  pages: VpatPage[];
  rows: VpatRow[]; // catalogue order, every A/AA criterion present
  unmapped: VpatFinding[]; // findings that matched no catalogued criterion
}

/** Accumulates one rule's reach while scanning violations. */
interface FindingAcc {
  ruleId: string;
  help: string;
  impact: Impact;
  pages: Set<string>;
  nodeCount: number;
}

function toFinding(acc: FindingAcc): VpatFinding {
  return {
    ruleId: acc.ruleId,
    help: acc.help,
    impact: acc.impact,
    pageCount: acc.pages.size,
    nodeCount: acc.nodeCount,
  };
}

/**
 * Findings are ordered the way a reader triages them: worst impact first, then
 * the widest reach. Rule id breaks ties so the document is byte-stable for the
 * same data.
 */
const IMPACT_RANK: Record<Impact, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

function sortFindings(findings: VpatFinding[]): VpatFinding[] {
  return findings.sort(
    (a, b) =>
      IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] ||
      b.nodeCount - a.nodeCount ||
      a.ruleId.localeCompare(b.ruleId),
  );
}

/**
 * The report's evidence base: the latest run per URL for one user, every
 * criterion in the WCAG 2.2 A/AA catalogue, and a determination for each.
 *
 * Returns null when the user has no audits at all — there is no honest report
 * to render from zero evidence, and the caller says so rather than shipping a
 * document of 55 "Supports" rows.
 *
 * Conformance follows the settled rule: a criterion with findings on *every*
 * audited page does not support, on *some* pages partially supports, and on
 * none supports. "Supports" here means only that automated checks found
 * nothing — the renderer states that limitation, and it is not optional.
 */
export async function buildVpatData(
  userId: string,
  productName: string,
  contactEmail: string,
): Promise<VpatReportData | null> {
  // Run skeletons, oldest first, so the last one seen per URL is the latest —
  // the dashboard's own semantics.
  const runs = await db
    .select({
      id: audit.id,
      url: audit.url,
      pageTitle: audit.pageTitle,
      scannedAt: audit.scannedAt,
    })
    .from(audit)
    .where(eq(audit.userId, userId))
    .orderBy(asc(audit.scannedAt));
  if (runs.length === 0) return null;

  const latestByUrl = new Map<string, (typeof runs)[number]>();
  for (const run of runs) latestByUrl.set(run.url, run);
  const latestRuns = [...latestByUrl.values()];
  const latestIds = latestRuns.map((r) => r.id);

  // Only the latest runs' violations. An older run's since-fixed issue must not
  // downgrade a criterion — the report describes the site as it stands now.
  const rows = await db
    .select({
      auditId: violation.auditId,
      ruleId: violation.ruleId,
      impact: violation.impact,
      help: violation.help,
      tags: violation.tags,
      nodes: violation.nodes,
    })
    .from(violation)
    .where(inArray(violation.auditId, latestIds));

  const urlOfAudit = new Map(latestRuns.map((r) => [r.id, r.url]));

  // rule id → accumulator, one map per criterion, plus one for the leftovers.
  const bySc = new Map<string, Map<string, FindingAcc>>();
  const unmapped = new Map<string, FindingAcc>();

  const attribute = (target: Map<string, FindingAcc>, row: (typeof rows)[number], url: string) => {
    const acc = target.get(row.ruleId) ?? {
      ruleId: row.ruleId,
      help: row.help,
      impact: row.impact,
      pages: new Set<string>(),
      nodeCount: 0,
    };
    acc.pages.add(url);
    acc.nodeCount += row.nodes.length;
    target.set(row.ruleId, acc);
  };

  for (const row of rows) {
    const url = urlOfAudit.get(row.auditId);
    if (!url) continue; // defensive: the join above cannot produce this
    const scs = row.tags.filter((t) => SC_TAG.test(t) && WCAG_22_BY_SC.has(t));
    if (scs.length === 0) {
      // Category-only tags, AAA criteria, or a legacy 4.1.1 — real findings
      // with no row to sit in, surfaced in the appendix rather than dropped.
      attribute(unmapped, row, url);
      continue;
    }
    // A rule failing 1.3.1 and 4.1.2 is evidence against both, counted in full
    // under each — these are per-criterion remarks, not a partitioned total.
    for (const sc of scs) {
      const target = bySc.get(sc) ?? new Map<string, FindingAcc>();
      attribute(target, row, url);
      bySc.set(sc, target);
    }
  }

  const pageCount = latestRuns.length;
  const reportRows: VpatRow[] = WCAG_22_CRITERIA.map((criterion) => {
    const accs = [...(bySc.get(criterion.sc)?.values() ?? [])];
    if (accs.length === 0) {
      return { criterion, conformance: "Supports", findings: [] };
    }
    const affected = new Set(accs.flatMap((a) => [...a.pages]));
    return {
      criterion,
      conformance: affected.size >= pageCount ? "Does Not Support" : "Partially Supports",
      findings: sortFindings(accs.map(toFinding)),
    };
  });

  const pages: VpatPage[] = latestRuns
    .map((r) => ({
      url: r.url,
      pageTitle: r.pageTitle,
      scannedAt: r.scannedAt.toISOString(),
    }))
    .sort((a, b) => a.url.localeCompare(b.url));

  return {
    // The pages are only known once they're loaded, so the fallback is applied
    // here rather than by every caller.
    productName: productName.trim() || defaultProductName(pages),
    contactEmail,
    generatedAt: new Date().toISOString(),
    pages,
    rows: reportRows,
    unmapped: sortFindings([...unmapped.values()].map(toFinding)),
  };
}

/**
 * The default product name: the distinct hostnames the report covers. Used by
 * the download route and the preview page so an untouched form still produces
 * a document that names what it describes.
 */
export function defaultProductName(pages: { url: string }[]): string {
  const hosts = new Set<string>();
  for (const p of pages) {
    try {
      hosts.add(new URL(p.url).hostname);
    } catch {
      // A stored URL that no longer parses shouldn't break the report title.
    }
  }
  return [...hosts].sort().join(", ");
}
