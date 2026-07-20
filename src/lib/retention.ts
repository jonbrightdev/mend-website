/* ============================================================
   Gated retention purge. Deletes a user's audits older than
   their plan's retention window, but only when the operator has
   explicitly turned it on. Imports "@/db", so it is server-only
   and must only be reached from server routes / server fns /
   tests after createTestDb().

   Two independent gates, both defaulting to off:
   - RETENTION_PURGE_ENABLED=true — the kill switch. Anything
     else (unset, "false", "1", "TRUE") means no DELETE ever runs.
   - a finite retentionDays. Legacy free is Infinity, so an
     unenforced deployment no-ops even with the flag on.
   ============================================================ */

import { and, count, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { audit } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most one purge per user per day: ingest is a hot path, and the rows a
    second pass would find are the handful that aged out in the meantime. */
const PURGE_INTERVAL_MS = DAY_MS;

// In-process, like the ingest rate limiter, and with the same single-node
// caveat: a second instance would keep its own map and purge up to once per
// day *per node*. Harmless (the DELETE is idempotent), but see railway.json.
const lastPurgeByUser = new Map<string, number>();

export type PurgeResult =
  | { ran: false; reason: "disabled" | "unlimited" | "throttled" }
  | { ran: true; dryRun: true; wouldDelete: number }
  | { ran: true; dryRun: false; deleted: number };

/** True only when RETENTION_PURGE_ENABLED === "true" (string compare, matching
    areFreeLimitsEnforced). */
export function isRetentionPurgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RETENTION_PURGE_ENABLED === "true";
}

/** Reports what a purge *would* delete instead of deleting it, so phase D can
    be observed on production data before the DELETE is armed. */
function isDryRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RETENTION_PURGE_DRY_RUN === "true";
}

/**
 * Deletes `userId`'s audits scanned before `now - retentionDays`, subject to
 * both gates and the once-a-day throttle. Violations go with them through the
 * audit FK's ON DELETE CASCADE.
 *
 * Known limitation: this is lazy, driven by ingest. A user who stops scanning
 * never triggers it again, so their old audits outlive the window until a
 * scheduled sweep exists (future work — see plan 039 maintenance notes).
 *
 * `now` is injectable so tests can advance past the throttle without waiting.
 */
export async function maybePurgeOldAudits(
  userId: string,
  retentionDays: number,
  now: () => number = Date.now,
): Promise<PurgeResult> {
  if (!isRetentionPurgeEnabled()) return { ran: false, reason: "disabled" };
  if (!Number.isFinite(retentionDays)) return { ran: false, reason: "unlimited" };

  const currentTime = now();
  const last = lastPurgeByUser.get(userId);
  if (last !== undefined && currentTime - last < PURGE_INTERVAL_MS) {
    return { ran: false, reason: "throttled" };
  }
  // Recorded before the query, so a failing purge doesn't retry on every
  // single ingest for the next 24h.
  lastPurgeByUser.set(userId, currentTime);

  const cutoff = new Date(currentTime - retentionDays * DAY_MS);
  const older = and(eq(audit.userId, userId), lt(audit.scannedAt, cutoff));

  if (isDryRun()) {
    const [row] = await db.select({ total: count() }).from(audit).where(older);
    const wouldDelete = row?.total ?? 0;
    console.info(
      `retention: dry run for user=${userId} cutoff=${cutoff.toISOString()} wouldDelete=${wouldDelete}`,
    );
    return { ran: true, dryRun: true, wouldDelete };
  }

  // `.returning()` takes no field selection in this drizzle version — it
  // returns full rows, and only the count is used here.
  const deleted = await db.delete(audit).where(older).returning();
  return { ran: true, dryRun: false, deleted: deleted.length };
}
