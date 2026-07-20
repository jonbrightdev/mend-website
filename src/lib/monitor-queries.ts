/* ============================================================
   DB queries for monitored pages, kept out of monitor-fns.ts on
   purpose: "@/db" is server-only, and a non-handler export that
   reaches it drags the db driver into the client bundle (the
   import-protection build error). monitor-fns.ts only calls these
   inside createServerFn handlers, which the client build strips.
   Mirrors the account-fns / account-queries split.
   ============================================================ */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { monitor } from "@/db/schema";
import { initialRunAt } from "@/lib/monitor-schedule";

// Monitor metadata safe to send to the client. Dates are ISO strings, like
// ApiKeyRow — server fn results cross a JSON boundary, so Date would arrive
// as a string anyway and the type would be lying.
export interface MonitorRow {
  id: string;
  url: string;
  createdAt: string;
  pausedAt: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  lastError: string | null;
}

// A capacity guard, not a billing tier. Ten daily scans per account is well
// inside what one Railway node can absorb; plan 039's entitlements may later
// make this plan-aware.
export const MAX_MONITORS = 10;

// The ingest route's url ceiling — a monitored url ends up in audit.url, so
// anything longer could never store its own results.
const MAX_URL_LENGTH = 2000;

type MonitorRecord = typeof monitor.$inferSelect;

function toRow(r: MonitorRecord): MonitorRow {
  return {
    id: r.id,
    url: r.url,
    createdAt: r.createdAt.toISOString(),
    pausedAt: r.pausedAt?.toISOString() ?? null,
    nextRunAt: r.nextRunAt.toISOString(),
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    lastError: r.lastError ?? null,
  };
}

export async function listMonitors(userId: string): Promise<MonitorRow[]> {
  const rows = await db
    .select()
    .from(monitor)
    .where(eq(monitor.userId, userId))
    .orderBy(desc(monitor.createdAt));
  return rows.map(toRow);
}

// Postgres raises 23505 on the (userId, url) unique index. Checking first would
// be a race; letting the insert fail and translating the error is both correct
// and one round trip.
function isDuplicateUrl(e: unknown): boolean {
  const cause = (e as { cause?: { code?: string } })?.cause;
  return cause?.code === "23505";
}

export async function addMonitor(userId: string, url: string): Promise<MonitorRow> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Enter a full URL, starting with http:// or https://.");
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new Error("That URL is too long to monitor.");
  }

  // Counts paused monitors too — a paused monitor still occupies a slot, and
  // the cap is about how many pages an account tracks, not how many run today.
  const existing = await db
    .select({ id: monitor.id })
    .from(monitor)
    .where(eq(monitor.userId, userId));
  if (existing.length >= MAX_MONITORS) {
    throw new Error(
      `You can monitor up to ${MAX_MONITORS} pages. Remove one to add another.`,
    );
  }

  try {
    const rows = await db
      .insert(monitor)
      .values({
        id: crypto.randomUUID(),
        userId,
        url: trimmed,
        nextRunAt: initialRunAt(new Date()),
      })
      .returning();
    // A single-row insert that did not throw returned exactly one row.
    return toRow(rows[0]!);
  } catch (e) {
    if (isDuplicateUrl(e)) {
      throw new Error("You're already monitoring this page.");
    }
    throw e;
  }
}

// Every mutation below is scoped `where (userId AND id)`. That pair is the
// entire security boundary between accounts — it must never widen.
export async function setPaused(
  userId: string,
  id: string,
  paused: boolean,
): Promise<void> {
  await db
    .update(monitor)
    .set(
      paused
        ? { pausedAt: new Date() }
        : // Resuming re-rolls the schedule: a monitor paused for a month would
          // otherwise carry a long-stale nextRunAt and fire the instant it woke.
          { pausedAt: null, nextRunAt: initialRunAt(new Date()) },
    )
    .where(and(eq(monitor.id, id), eq(monitor.userId, userId)));
}

export async function deleteMonitor(userId: string, id: string): Promise<void> {
  await db
    .delete(monitor)
    .where(and(eq(monitor.id, id), eq(monitor.userId, userId)));
}
