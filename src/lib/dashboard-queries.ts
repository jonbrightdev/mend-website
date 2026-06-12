/* ============================================================
   Server-only dashboard queries. Imports the database — never
   import this from client-reachable code; go through the server
   functions in src/lib/dashboard-fns.ts instead.
   ============================================================ */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { audit, violation } from "@/db/schema";
import type { AuditRecord, Violation } from "@/lib/dashboard-data";

type AuditRow = typeof audit.$inferSelect;
type ViolationRow = typeof violation.$inferSelect;

// The trend chart shows at most this many runs along the x-axis.
const MAX_RUN_DATES = 8;

function toViolation(row: ViolationRow): Violation {
  return {
    id: row.ruleId,
    impact: row.impact,
    help: row.help,
    helpUrl: row.helpUrl ?? "",
    description: row.description,
    tags: row.tags,
    nodes: row.nodes,
  };
}

function nodeTotal(violations: ViolationRow[]): number {
  return violations.reduce((sum, v) => sum + v.nodes.length, 0);
}

function dayOf(d: Date): string {
  const iso = d.toISOString();
  return iso.slice(0, 10); // YYYY-MM-DD
}

/**
 * Every run for the user, shaped for the dashboard: the latest run per URL
 * becomes the page's AuditRecord; older runs of the same URL feed history[],
 * aligned to runDates (distinct run days, oldest first, capped at 8). Days
 * before a page's first run count 0; between runs the last total carries
 * forward.
 */
export async function getDashboardData(
  userId: string,
): Promise<{ audits: AuditRecord[]; runDates: string[] }> {
  const runs = await db
    .select()
    .from(audit)
    .where(eq(audit.userId, userId))
    .orderBy(asc(audit.scannedAt));
  if (runs.length === 0) return { audits: [], runDates: [] };

  const violationRows = await db
    .select()
    .from(violation)
    .where(inArray(violation.auditId, runs.map((r) => r.id)));

  const byAudit = new Map<string, ViolationRow[]>();
  for (const v of violationRows) {
    const list = byAudit.get(v.auditId) ?? [];
    list.push(v);
    byAudit.set(v.auditId, list);
  }

  const runDates = [...new Set(runs.map((r) => dayOf(r.scannedAt)))]
    .sort()
    .slice(-MAX_RUN_DATES);

  const byUrl = new Map<string, AuditRow[]>();
  for (const r of runs) {
    const list = byUrl.get(r.url) ?? [];
    list.push(r); // already ordered oldest → newest
    byUrl.set(r.url, list);
  }

  const audits: AuditRecord[] = [...byUrl.values()].map((urlRuns) => {
    const latest = urlRuns[urlRuns.length - 1]!;
    const history = runDates.map((date) => {
      let total = 0;
      for (const run of urlRuns) {
        if (dayOf(run.scannedAt) > date) break;
        total = nodeTotal(byAudit.get(run.id) ?? []);
      }
      return total;
    });
    return {
      id: latest.id,
      url: latest.url,
      pageTitle: latest.pageTitle,
      scannedAt: latest.scannedAt.toISOString(),
      history,
      violations: (byAudit.get(latest.id) ?? []).map(toViolation),
    };
  });

  // Newest scan first, matching the dashboard table's default order.
  audits.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  return { audits, runDates };
}

/** A single run by id, scoped to the owning user. history is not populated. */
export async function getAuditRecord(
  userId: string,
  auditId: string,
): Promise<AuditRecord | undefined> {
  const [run] = await db
    .select()
    .from(audit)
    .where(and(eq(audit.id, auditId), eq(audit.userId, userId)))
    .limit(1);
  if (!run) return undefined;

  const violationRows = await db
    .select()
    .from(violation)
    .where(eq(violation.auditId, run.id));

  return {
    id: run.id,
    url: run.url,
    pageTitle: run.pageTitle,
    scannedAt: run.scannedAt.toISOString(),
    history: [],
    violations: violationRows.map(toViolation),
  };
}
