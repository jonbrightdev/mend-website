/* ============================================================
   Server-only dashboard queries. Imports the database — never
   import this from client-reachable code; go through the server
   functions in src/lib/dashboard-fns.ts instead.
   ============================================================ */

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { audit, violation } from "@/db/schema";
import type { AuditRecord, TrendPoint, Violation } from "@/lib/dashboard-data";

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
 *
 * Only lightweight data is loaded: run skeletons (no violation payloads),
 * per-run node totals summed in SQL for the history line, and the full
 * violation rows for just the latest run of each URL — the only runs the
 * dashboard shows issue detail for.
 */
export async function getDashboardData(
  userId: string,
): Promise<{ audits: AuditRecord[]; runDates: string[] }> {
  // Run skeletons only — these rows are small; the weight was the nodes payload.
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
  if (runs.length === 0) return { audits: [], runDates: [] };

  // Per-run node totals for history, summed SQL-side so the nodes payloads are
  // never loaded just to be counted. Joined on audit to scope to the owner
  // without shipping every run id back in the query.
  const totals = await db
    .select({
      auditId: violation.auditId,
      total: sql<number>`sum(jsonb_array_length(${violation.nodes}))`.mapWith(Number),
    })
    .from(violation)
    .innerJoin(audit, eq(violation.auditId, audit.id))
    .where(eq(audit.userId, userId))
    .groupBy(violation.auditId);
  // Runs absent from the result have no violations → total 0.
  const totalByAudit = new Map(totals.map((t) => [t.auditId, t.total]));

  const runDates = [...new Set(runs.map((r) => dayOf(r.scannedAt)))]
    .sort()
    .slice(-MAX_RUN_DATES);

  const byUrl = new Map<string, typeof runs>();
  for (const r of runs) {
    const list = byUrl.get(r.url) ?? [];
    list.push(r); // already ordered oldest → newest
    byUrl.set(r.url, list);
  }

  // Full violation rows for only the latest run of each URL.
  const latestIds = [...byUrl.values()].map(
    (urlRuns) => urlRuns[urlRuns.length - 1]!.id,
  );
  const latestViolations = await db
    .select()
    .from(violation)
    .where(inArray(violation.auditId, latestIds));
  const violationsByAudit = new Map<string, ViolationRow[]>();
  for (const v of latestViolations) {
    const list = violationsByAudit.get(v.auditId) ?? [];
    list.push(v);
    violationsByAudit.set(v.auditId, list);
  }

  const audits: AuditRecord[] = [...byUrl.values()].map((urlRuns) => {
    const latest = urlRuns[urlRuns.length - 1]!;
    const history = runDates.map((date) => {
      let total = 0;
      for (const run of urlRuns) {
        if (dayOf(run.scannedAt) > date) break;
        total = totalByAudit.get(run.id) ?? 0;
      }
      return total;
    });
    return {
      id: latest.id,
      url: latest.url,
      pageTitle: latest.pageTitle,
      scannedAt: latest.scannedAt.toISOString(),
      history,
      violations: (violationsByAudit.get(latest.id) ?? []).map(toViolation),
    };
  });

  // Newest scan first, matching the dashboard table's default order.
  audits.sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  return { audits, runDates };
}

/**
 * A single run by id, scoped to the owning user. history is not populated;
 * the page's own trend is returned separately as day-bucketed TrendPoints
 * (one point per run day of this URL, the day's last run's node total).
 */
export async function getAuditRecord(
  userId: string,
  auditId: string,
): Promise<{ record: AuditRecord; trend: TrendPoint[] } | undefined> {
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

  // Every run of this page, oldest first, for the trend.
  const pageRuns = await db
    .select({ id: audit.id, scannedAt: audit.scannedAt })
    .from(audit)
    .where(and(eq(audit.userId, userId), eq(audit.url, run.url)))
    .orderBy(asc(audit.scannedAt));

  // Per-run node totals summed SQL-side, same idiom as getDashboardData but
  // scoped to this page. Runs absent from the result have no violations → 0.
  const totals = await db
    .select({
      auditId: violation.auditId,
      total: sql<number>`sum(jsonb_array_length(${violation.nodes}))`.mapWith(Number),
    })
    .from(violation)
    .innerJoin(audit, eq(violation.auditId, audit.id))
    .where(and(eq(audit.userId, userId), eq(audit.url, run.url)))
    .groupBy(violation.auditId);
  const totalByAudit = new Map(totals.map((t) => [t.auditId, t.total]));

  // One point per run day; a later same-day run overwrites the earlier one's
  // slot, so each day keeps its last run. Runs ascend, so days ascend too.
  const lastRunOfDay = new Map<string, string>();
  for (const r of pageRuns) lastRunOfDay.set(dayOf(r.scannedAt), r.id);
  const trend: TrendPoint[] = [...lastRunOfDay].map(([date, id]) => ({
    date,
    total: totalByAudit.get(id) ?? 0,
  }));

  return {
    record: {
      id: run.id,
      url: run.url,
      pageTitle: run.pageTitle,
      scannedAt: run.scannedAt.toISOString(),
      history: [],
      violations: violationRows.map(toViolation),
    },
    trend,
  };
}
