/* ============================================================
   Pure scheduling math for monitored pages. No imports, no db,
   no clock of its own — `now` and `rand` are always passed in, so
   every case below is deterministically testable.

   The product promise is "once a day, at a time we pick". We
   re-roll that time on every run so a monitored site never sees a
   predictable request pattern from us, and so our own load spreads
   evenly across the day instead of stacking at midnight.
   ============================================================ */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * First run: a uniformly random instant within the next 24 hours.
 *
 * New monitors produce data on day one rather than waiting for the next
 * calendar day to open. Lands in `(now, now + 24h]` — never `now` itself,
 * so a freshly created monitor is not instantly due.
 */
export function initialRunAt(now: Date, rand: () => number = Math.random): Date {
  const offset = Math.floor(rand() * DAY_MS) + 1;
  return new Date(now.getTime() + offset);
}

/**
 * Steady state: a uniformly random instant inside the NEXT UTC calendar day.
 *
 * Anchoring to the day *after* the one containing `now` guarantees exactly one
 * run per calendar day even when a run finishes at 23:59 — offsetting from
 * `now` instead would let two runs share a day and then drift.
 */
export function nextRunAt(now: Date, rand: () => number = Math.random): Date {
  const tomorrow = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return new Date(tomorrow + Math.floor(rand() * DAY_MS));
}
