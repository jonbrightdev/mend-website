/* ============================================================
   Boot hook for the monitor scheduler (plan 045).

   Off unless MONITOR_SCHEDULER_ENABLED=true, the same off-by-default
   env-flag idiom the billing plans use for FREE_LIMITS_ENFORCED. The
   flag is set in the Railway dashboard, never in the repo, and stays
   unset until plan 044's Chromium deploy has been verified — until
   then production simply never starts the ticker.

   This is the only file that knows how the server starts; the loop
   itself lives in src/lib/monitor-ticker.ts so it stays testable.
   ============================================================ */

import { definePlugin } from "nitro";
import { createMonitorTicker } from "@/lib/monitor-ticker";

export default definePlugin((nitro) => {
  if (process.env.MONITOR_SCHEDULER_ENABLED !== "true") return;

  const ticker = createMonitorTicker();
  ticker.start();
  console.log("monitor scheduler: started");

  // An in-flight scan still dies with the process at deploy time; the claimed
  // monitor self-heals tomorrow (claim-then-run). This only stops the timer
  // from firing a new batch into a server that is shutting down.
  nitro.hooks.hook("close", () => {
    ticker.stop();
    console.log("monitor scheduler: stopped");
  });
});
