/* ============================================================
   Server functions for the /monitors page: the CRUD around
   monitored pages. Session-guarded; every mutation is scoped to
   the caller inside monitor-queries.ts.

   Everything that touches "@/db" outside a handler body lives in
   monitor-queries.ts — a plain export here that reaches the db
   survives into the client bundle and fails the build's
   server-only import protection.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { currentSessionUser } from "@/lib/session";
import {
  addMonitor,
  deleteMonitor,
  findMonitor,
  listMonitors,
  MAX_MONITORS,
  setPaused,
} from "@/lib/monitor-queries";
import { runMonitor } from "@/lib/run-monitor";

const RUN_NOW_COOLDOWN_MS = 10 * 60 * 1000;

// Only a *type* re-export is safe here. Re-exporting a value from
// monitor-queries (MAX_MONITORS, say) survives into the client bundle and
// drags "@/db" with it — the cap travels in the loader payload instead.
export type { MonitorRow } from "@/lib/monitor-queries";

export const fetchMonitors = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return {
      user,
      monitors: await listMonitors(user.id),
      // Sent rather than imported by the page: keeps the client off "@/db",
      // and when plan 039 makes the cap plan-aware the UI already reads
      // whatever the server decided.
      maxMonitors: MAX_MONITORS,
    };
  },
);

// The url is validated properly in addMonitor (scheme, length, duplicate) so
// the messages a user sees come from one place; this only guards the type.
export const createMonitor = createServerFn({ method: "POST" })
  .validator((url: unknown): string => {
    if (typeof url !== "string" || url.trim().length === 0) {
      throw new Error("Enter a URL to monitor.");
    }
    return url;
  })
  .handler(async ({ data: url }) => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await addMonitor(user.id, url);
    return { monitors: await listMonitors(user.id) };
  });

export const toggleMonitor = createServerFn({ method: "POST" })
  .validator((input: unknown): { id: string; paused: boolean } => {
    const { id, paused } = (input ?? {}) as { id?: unknown; paused?: unknown };
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("id is required");
    }
    return { id, paused: paused === true };
  })
  .handler(async ({ data: { id, paused } }) => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await setPaused(user.id, id, paused);
    return { monitors: await listMonitors(user.id) };
  });

// A manual scan, which is also the deploy-verification hook for the scan
// engine: if Chromium isn't available in the container, this is where it shows
// up — as `lastError` on the row, not as a crash.
export const runMonitorNow = createServerFn({ method: "POST" })
  .validator((id: unknown): string => {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("id is required");
    }
    return id;
  })
  .handler(async ({ data: id }) => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });

    const target = await findMonitor(user.id, id);
    if (!target) throw new Error("That monitored page no longer exists.");

    // A browser launch is expensive and a monitor is a daily job — this button
    // is a convenience, not a load generator.
    if (target.lastRunAt && Date.now() - target.lastRunAt.getTime() < RUN_NOW_COOLDOWN_MS) {
      throw new Error("This page was scanned in the last few minutes. Try again shortly.");
    }

    await runMonitor(target);
    return { monitors: await listMonitors(user.id) };
  });

export const removeMonitor = createServerFn({ method: "POST" })
  .validator((id: unknown): string => {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("id is required");
    }
    return id;
  })
  .handler(async ({ data: id }) => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await deleteMonitor(user.id, id);
    return { monitors: await listMonitors(user.id) };
  });
