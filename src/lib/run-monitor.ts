/* ============================================================
   Orchestrates one monitor run: scan → store → record the outcome
   on the monitor row. Used by "Run now" today and by the scheduler
   in plan 045.

   Never throws for an ordinary scan failure. A monitor that cannot
   be reached is a *result* ("Error", with the reason), not an
   exception for the caller to handle — the scheduler must be able
   to run ten monitors without one bad page aborting the batch.
   ============================================================ */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitor } from "@/db/schema";
import { storeAuditRun } from "@/lib/audit-store";
import { nextRunAt } from "@/lib/monitor-schedule";
import { scanPage } from "@/lib/scan/scanner";
import type { IngestPayload } from "@/lib/ingest-payload";
import type { MonitorTarget } from "@/lib/monitor-queries";

// Long enough to keep the useful part of a Playwright timeout message, short
// enough that a stack-trace-shaped error can't bloat the row.
const MAX_ERROR_LENGTH = 500;

export type { MonitorTarget } from "@/lib/monitor-queries";

export interface RunMonitorResult {
  ok: boolean;
  error: string | null;
}

// `scan` is injectable so tests can exercise the orchestration — the storing,
// the error clipping, the reschedule — without launching a browser.
export async function runMonitor(
  target: MonitorTarget,
  scan: (url: string) => Promise<IngestPayload> = scanPage,
): Promise<RunMonitorResult> {
  const now = new Date();
  let error: string | null = null;

  try {
    const payload = await scan(target.url);
    await storeAuditRun(target.userId, payload);
  } catch (e) {
    error = clipError(e);
    console.error(`monitor ${target.id}: run failed`, e);
  }

  // A failed run still advances nextRunAt. Leaving it in the past would make a
  // permanently-broken page hot-loop through every scheduler tick.
  await db
    .update(monitor)
    .set({ lastRunAt: now, lastError: error, nextRunAt: nextRunAt(now) })
    .where(eq(monitor.id, target.id));

  return { ok: error === null, error };
}

function clipError(e: unknown): string {
  const message = e instanceof Error && e.message ? e.message : String(e);
  return message.slice(0, MAX_ERROR_LENGTH) || "The scan failed for an unknown reason.";
}
