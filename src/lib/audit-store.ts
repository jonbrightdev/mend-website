/* ============================================================
   The single write path for a completed audit run, shared by
   /api/ingest (the extension) and the monitor scanner. Keeping
   one implementation is what makes a monitor run indistinguishable
   from an extension run to the dashboard, detail pages, export,
   and the VPAT report — idempotency key, grouping, and transaction
   boundary are decided here and nowhere else.

   "@/db" is server-only; this module is imported exclusively from
   server routes and server fns.
   ============================================================ */

import { db } from "@/db";
import { audit, violation } from "@/db/schema";
import { groupViolations, type IngestPayload } from "@/lib/ingest-payload";

export type StoreResult =
  | { duplicate: true }
  | { duplicate: false; auditId: string; count: number };

// Stores one parsed audit run for a user. Both writes go in one transaction: a
// half-written run would be permanent, since the retry hits the conflict path
// below and returns success without ever writing the missing violations.
export async function storeAuditRun(
  userId: string,
  payload: IngestPayload,
): Promise<StoreResult> {
  const auditId = crypto.randomUUID();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(audit)
      .values({
        id: auditId,
        userId,
        url: payload.url,
        pageTitle: payload.pageTitle,
        scannedAt: payload.scannedAt,
        durationMs: payload.durationMs,
        totalChecks: payload.totalChecks,
        partial: payload.partial,
      })
      .onConflictDoNothing()
      .returning();

    // Same (user, url, scannedAt) already stored: idempotent success.
    if (inserted.length === 0) return { duplicate: true as const };

    const violations = groupViolations(auditId, payload.issues);
    if (violations.length > 0) {
      await tx.insert(violation).values(violations);
    }
    return { duplicate: false as const, auditId, count: violations.length };
  });
}
