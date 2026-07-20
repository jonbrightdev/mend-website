/* ============================================================
   The scheduler loop: wake every minute, claim whatever is due,
   run it sequentially.

   Deliberately not BullMQ/Redis. There is one Railway node, and
   `monitor.nextRunAt` in Postgres already *is* the queue — durable,
   and self-healing across deploys, because an overdue nextRunAt is
   simply "due" on the first tick after boot. That is why no
   reconcile step exists: there is nothing to reconcile.

   Kept free of any boot API so it can be driven directly by tests;
   the nitro plugin in src/server/plugins/ is the only thing that
   knows how the server starts.
   ============================================================ */

import { claimDueMonitors, type MonitorTarget } from "@/lib/monitor-queries";
import { runMonitor } from "@/lib/run-monitor";

const TICK_MS = 60_000;
// One tick's worth of work. Anything beyond simply waits for the next tick —
// a backlog drains steadily instead of one tick trying to launch 200 browsers.
const BATCH_LIMIT = 20;

export interface MonitorTicker {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
}

export function createMonitorTicker(deps?: {
  claim?: (now: Date, limit: number) => Promise<MonitorTarget[]>;
  run?: (target: MonitorTarget) => Promise<unknown>;
  intervalMs?: number;
  batchLimit?: number;
  now?: () => Date;
}): MonitorTicker {
  const claim = deps?.claim ?? claimDueMonitors;
  const run = deps?.run ?? runMonitor;
  const intervalMs = deps?.intervalMs ?? TICK_MS;
  const batchLimit = deps?.batchLimit ?? BATCH_LIMIT;
  const now = deps?.now ?? (() => new Date());

  let timer: ReturnType<typeof setInterval> | null = null;
  // A scan takes tens of seconds, so a batch can outlive its tick interval.
  // Overlapping ticks return immediately rather than stacking browsers.
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const due = await claim(now(), batchLimit);
      // Sequential on purpose: one Chromium at a time is the memory budget.
      for (const target of due) {
        try {
          await run(target);
        } catch (e) {
          // runMonitor is designed never to throw for a scan failure, so this
          // is a bug or an infrastructure fault — log it and keep going, so
          // one bad monitor can't strand the rest of the batch.
          console.error(`monitor scheduler: run threw for ${target.id}`, e);
        }
      }
    } catch (e) {
      // A claim failure (database down) must not kill the interval — the next
      // tick retries, and the claim is idempotent by construction.
      console.error("monitor scheduler: tick failed", e);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), intervalMs);
      // Nitro's process should not be held open by this timer alone.
      timer.unref?.();
      // Fire once immediately: this is the boot catch-up, and the only reason
      // a deploy doesn't delay every overdue monitor by up to a minute.
      void tick();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick,
  };
}
