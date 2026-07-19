# Plan 045: The monitor scheduler — daily random-time runs, in-process

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: plans 043 and 044 must be DONE
> (`monitor` table, `monitor-schedule.ts`, `run-monitor.ts` all exist).
> `git diff --stat a0f7690..HEAD -- vite.config.ts src/lib/run-monitor.ts src/lib/monitor-queries.ts`
> and compare against the excerpts in 043/044.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM (server boot hook in a nightly nitro — the one unknown;
  everything else is a pure loop over machinery 043/044 built)
- **Depends on**: 043, 044
- **Category**: feature — monitoring generation (043 → 044 → 045)
- **Planned at**: commit `a0f7690`, 2026-07-19

## Why this matters

043 stores monitors with a `nextRunAt`; 044 can run one on demand. This plan
closes the loop: a ticker in the server process wakes every minute, claims
monitors whose `nextRunAt` has passed (and that aren't paused), runs them
**sequentially** through `runMonitor`, and lets `runMonitor`'s own
`nextRunAt` re-roll push each one into a random time tomorrow. That is the
entire "we monitor them daily on a schedule, a random time once a day"
promise.

har-analyzer does this with BullMQ + Redis and `reconcileSchedules()` on
worker boot. We deliberately don't: one Railway node, state already durable
in Postgres (`nextRunAt` *is* the queue), and catch-up on boot falls out for
free — an overdue `nextRunAt` is simply "due" on the first tick after a
deploy or crash. No reconcile step exists because there is nothing to
reconcile.

## Design decisions (settled — do not re-litigate)

- **In-process `setInterval`, 60 s tick.** Matches the repo's single-node
  stance (rate limiter, plan 024 notes). The revisit trigger is the same as
  the limiter's: a second node. Postgres claiming (below) is written so a
  second node would double-*tick* but not double-*run*.
- **Claim by atomic update**: a tick does
  `UPDATE monitor SET nextRunAt = <tomorrow-random> WHERE nextRunAt <= now
  AND pausedAt IS NULL RETURNING *`, then runs the returned rows. Claiming
  *first* means a crash mid-run loses at most one day's run (self-heals
  tomorrow) instead of hot-looping a crashing scan every minute.
  `runMonitor` (044) then overwrites `nextRunAt` again on completion —
  harmless double-roll, both land tomorrow.
- **Sequential, never parallel** — one Chromium at a time (memory budget,
  see 044).
- **Env-gated**: the ticker starts only when `MONITOR_SCHEDULER_ENABLED=true`
  (set on Railway; absent in dev/test/CI). Same off-by-default flag idiom as
  the billing plans' `FREE_LIMITS_ENFORCED`.
- **A tick is bounded**: cap 20 claimed monitors per tick (`LIMIT` via a
  subquery); anything beyond runs next tick. A skipped/overlapping tick is
  prevented by an in-process `running` flag — ticks that fire while a batch
  is still scanning return immediately.

## Current state

- `vite.config.ts` — `nitro({ rollupConfig: { external: [...] } })`; nitro
  is the pinned nightly (`nitro-nightly@3.0.1-…`, CLAUDE.md forbids
  re-resolving it). Nitro supports server **plugins** (files listed in nitro
  config `plugins`, run once at server boot with the nitro app instance) —
  **verify this against the pinned nightly's actual behavior; it is this
  plan's only unknown.**
- `src/lib/run-monitor.ts` (044) — one call runs scan+store+row update and
  never throws for run failures (failures land in `lastError`).
- `src/lib/monitor-schedule.ts` (043) — `nextRunAt(now)`.
- `railway.json` — start command `node .output/server/index.mjs`; env vars
  are set in the Railway dashboard, not in the repo.

## Commands you will need

| Purpose   | Command                                  | Expected |
|-----------|------------------------------------------|----------|
| Typecheck | `pnpm typecheck`                         | exit 0   |
| Tests     | `pnpm test`                              | all pass |
| Lint/Build| `pnpm lint && pnpm build`                | exit 0   |
| Boot check| `MONITOR_SCHEDULER_ENABLED=true pnpm dev` | "monitor scheduler: started" logged once |

## Scope

**In scope**:
- `src/lib/monitor-queries.ts` — add `claimDueMonitors(now, limit)` (+tests)
- `src/lib/monitor-ticker.ts` (+tests) — the tick loop, pure of any boot API
- `src/server/plugins/monitor-scheduler.ts` (or wherever the nitro plugin
  convention puts it) — ~10 lines: env gate, start ticker, log
- `vite.config.ts` — register the plugin in the nitro options
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `run-monitor.ts`, `scanner.ts`, `monitor-schedule.ts` internals
- Schema changes
- Alerting, run history tables, admin views
- `railway.json` (the env var is dashboard-set; document it, don't commit it)

## Git workflow

Work directly on `main`; commit e.g.
`Run due monitors on a one-minute in-process scheduler`.
Do NOT push unless the operator instructed it.

## Steps

### Step 1: `claimDueMonitors`

In `monitor-queries.ts`:

```ts
/** Atomically claims due, unpaused monitors by rolling their nextRunAt into
 *  tomorrow's random slot, returning what was claimed. Claim-then-run: a
 *  crash mid-batch costs one day's run, never a retry loop. */
export async function claimDueMonitors(now: Date, limit: number): Promise<
  { id: string; userId: string; url: string }[]
>
```

Drizzle: `update(monitor).set({ nextRunAt: nextRunAt(now) }).where(inArray(monitor.id, <select due ids limit N>)).returning(...)`
— the `nextRunAt(now)` value may be computed once per batch (identical slot
for the batch is fine; `runMonitor` re-rolls each individually anyway).

Tests (PGlite): due+unpaused claimed and their `nextRunAt` now in tomorrow's
UTC day; paused-but-due not claimed; future not claimed; limit respected
(oldest `nextRunAt` first); second immediate call claims nothing.

### Step 2: The ticker

`src/lib/monitor-ticker.ts`:

```ts
export function createMonitorTicker(deps?: {
  claim?: typeof claimDueMonitors;
  run?: typeof runMonitor;
  intervalMs?: number;   // default 60_000
  batchLimit?: number;   // default 20
}): { start(): void; stop(): void; tick(): Promise<void> }
```

`tick()`: if `running`, return; set `running`; claim; `for … of` →
`await run(m)` each inside its own try/catch (a throw from `run` — which
should be impossible per 044 — is logged with the monitor id and the loop
continues); clear `running` in `finally`. `start()` sets the interval **and
fires one immediate `tick()`** (boot catch-up); `stop()` clears it (used by
tests and graceful shutdown if nitro exposes a close hook — optional).

Tests (all with injected fakes, fake timers): immediate tick on start;
sequential order (second run not invoked until first resolves); overlapping
tick skipped while running; one run's rejection doesn't stop the batch;
stop() halts.

### Step 3: The boot hook

Nitro plugin file (default export receiving the nitro app):

```ts
export default defineNitroPlugin(() => {
  if (process.env.MONITOR_SCHEDULER_ENABLED !== "true") return;
  createMonitorTicker().start();
  console.log("monitor scheduler: started");
});
```

Register in `vite.config.ts` nitro options (`plugins: [...]` with the file
path). **First verify the pinned nightly honors it**: add the plugin with
just the log line, run `MONITOR_SCHEDULER_ENABLED=true pnpm dev` and
`pnpm build && MONITOR_SCHEDULER_ENABLED=true node .output/server/index.mjs`,
confirm the log appears exactly once in both. If the nightly's plugin
registration differs from documented nitro (this is a nightly — APIs move),
find the equivalent supported hook; if none exists, STOP.

Import discipline: the plugin imports server-only modules — confirm
`pnpm build` passes the server-only import protection (the plugin is not
client-reachable, so it should).

### Step 4: Full gate + ops note

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` → exit 0. Then the
dev-server boot check above, plus one end-to-end local pass: create a
monitor, `UPDATE monitor SET "nextRunAt" = now()` via the dev database (or a
temporary test), watch the next tick scan it and the audit appear.

Ops (operator, not executor): set `MONITOR_SCHEDULER_ENABLED=true` and
`CHROMIUM_PATH` (if needed — 044) in Railway *after* 044's deploy
verification passed. Until then production simply never starts the ticker.

## Done criteria

- [ ] Ticker + claim covered by tests; full suite green
- [ ] Boot log appears exactly once under `pnpm dev` and the built server
      (with the flag), and not at all without the flag
- [ ] Local end-to-end: a due monitor is scanned by the ticker and its audit
      is on the dashboard
- [ ] `pnpm typecheck`/`lint`/`build` exit 0; no out-of-scope files modified
- [ ] `plans/README.md` status row updated (note whether Railway flag was
      flipped or left for the operator)

## STOP conditions

- The pinned nitro nightly offers no working boot-time plugin/hook path —
  report; do not fall back to module-side-effect hacks (an import-time
  `setInterval` in a route-reachable module would also run in dev SSR
  workers and tests) without a decision.
- Registering the plugin forces any change to the nitro dependency pin.
- `claimDueMonitors` cannot be expressed atomically in Drizzle against both
  Postgres and the PGlite test harness.

## Maintenance notes

- **Second node = rewrite trigger.** The claim is already atomic, so N nodes
  won't double-run; but N tickers × sequential batches changes the memory
  math and the "one Chromium" budget. Same revisit note as the rate limiter.
- A monitor created today runs today (043's `initialRunAt` is within 24 h,
  and the ticker picks it up whenever it lands) — no special-casing.
- Observability is one boot log + `lastError` on rows. If monitors grow into
  a paid promise (billing plans), add a run-history table then — rejected
  now as speculative.
- Graceful shutdown: an in-flight scan at deploy time dies with the process;
  the claimed monitor self-heals tomorrow (claim-first design). Accepted.
