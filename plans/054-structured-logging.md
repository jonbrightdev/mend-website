# Plan 054: Replace ad-hoc console calls with one structured logger

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9930443..HEAD -- src/lib src/routes/api src/server`
> If the call sites listed in "Current state" have moved or changed, re-run the
> inventory grep in Step 1 and work from its output rather than this list.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `9930443`, 2026-07-21

## Why this matters

Production failures in this app surface in exactly two ways: an unstructured
`console.*` line in Railway's log stream, or a `lastError` text column on the
`monitor` table. There is no correlation id, no consistent shape, and no way to
tell which request produced which line.

That is thin for the paths it covers. The 17 call sites include the Stripe
webhook pipeline (money), the pre-delete Stripe cleanup in `auth.ts` (which
fails closed and must be diagnosable), the ingest storage transaction, and the
monitor scheduler. Diagnosing an incident today means grepping a raw log stream
for a remembered string.

After this plan every one of those sites emits a single-line JSON object with a
consistent shape — `level`, `event`, `msg`, and structured fields — so Railway's
log search can filter by event name rather than substring, and a future
aggregation service has something to parse. This plan deliberately does **not**
add a dependency or an external service.

## Current state

There are **17** `console.*` calls in non-test source — verified by
`grep -rn "console\." src --include="*.ts" --include="*.tsx" | grep -v test | wc -l`.

The full inventory, grouped by area:

| File | Calls |
|---|---|
| `src/routes/api/billing/webhook.ts` | 5 (`missing signature header`, `signature verification failed`, `failed to prepare event`, `no-op event`, `failed to apply event`) |
| `src/routes/api/ingest.ts` | 2 (`failed to store audit`, `retention purge failed`) |
| `src/routes/api/billing/checkout.ts` | 1 (`console.warn`, multi-line) |
| `src/lib/monitor-ticker.ts` | 2 (`run threw for <id>`, `tick failed`) |
| `src/lib/run-monitor.ts` | 1 (`monitor <id>: run failed`) |
| `src/lib/auth.ts` | 1 (`stripe cleanup failed before account delete`) |
| `src/lib/scan/scanner.ts` | 1 (`renderer crashed on <url>, retrying once`) |
| `src/server/plugins/monitor-scheduler.ts` | 2 (`started`, `stopped`) |
| `src/lib/mailer.ts` | 1 (`[mail:dev]` — **special, see below**) |

Representative examples as they exist today:

```ts
// src/routes/api/billing/webhook.ts
console.error("webhook: failed to apply event", event.id, event.type, e);

// src/lib/run-monitor.ts
console.error(`monitor ${target.id}: run failed`, e);

// src/lib/scan/scanner.ts
console.warn(`scan: renderer crashed on ${url}, retrying once`);
```

Note the existing convention: messages are already prefixed with a subsystem
name (`webhook:`, `monitor`, `scan:`, `ingest:`). Preserve that information as
a structured field rather than losing it.

### `src/lib/mailer.ts` is a deliberate exception

That call prints a full email body to the console in dev when no mail provider
is configured. It is a developer affordance, not operational logging, and it
intentionally writes multi-line human-readable output. **Leave it alone** — see
Scope.

### Conventions this repo uses — match them

- **Pure, testable modules with a server-only boundary.** Modules that touch
  `@/db` or secrets live behind `-queries.ts` / server-only imports; pure
  helpers are separately testable. A logger is pure and belongs in `src/lib/`.
  `src/lib/security-headers.ts` is a good exemplar of a small pure module with
  a unit test beside it.
- **Comments explain *why*.** See `src/lib/security-headers.ts` for the density
  expected.
- **Tests use Vitest.** Pure modules get a `*.test.ts` twin in the same
  directory.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | exit 0 |
| Generate routes | `pnpm generate-routes` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Targeted tests | `pnpm vitest run src/lib/logger.test.ts` | all pass |
| Full suite | `pnpm test` | all pass (528 at plan time) |
| Build | `pnpm build` | exit 0 |

Run `nvm use` first — `.nvmrc` pins Node 24.

## Scope

**In scope**:

- `src/lib/logger.ts` (create)
- `src/lib/logger.test.ts` (create)
- `src/routes/api/billing/webhook.ts`
- `src/routes/api/billing/checkout.ts`
- `src/routes/api/ingest.ts`
- `src/lib/monitor-ticker.ts`
- `src/lib/run-monitor.ts`
- `src/lib/auth.ts`
- `src/lib/scan/scanner.ts`
- `src/server/plugins/monitor-scheduler.ts`

**Out of scope** (do NOT touch, even though they look related):

- `src/lib/mailer.ts` — the `[mail:dev]` console line is a deliberate developer
  affordance that prints a readable multi-line email body when no provider is
  configured. Converting it to JSON makes it useless for its actual purpose.
- **Any new dependency.** Do not add `pino`, `winston`, `bunyan`, or an error
  reporting SDK. This plan is a shape change, not a vendor decision. Adding a
  service is a separate call with cost and privacy implications (audit data
  includes customer page content).
- **Any `console.*` in test files.** Tests print freely; leave them.
- **Behavior changes.** No control flow, no swallowing or re-throwing changes.
  Every `try`/`catch` boundary stays exactly where it is — only the line
  *inside* it changes.
- Client components — this is server-side logging only.

## Git workflow

- Work directly on `main` — this repo does not use feature branches (see
  `CLAUDE.md`). Do not open a PR.
- Commit message style: imperative subject, blank line, prose body explaining
  *why*. Recent example: `Add security headers to every response`.
- Do **not** push. Leave the commit local for review.

## Steps

### Step 1: Re-run the inventory

Before changing anything, produce the current list:

```
grep -rn "console\." src --include="*.ts" --include="*.tsx" | grep -v test
```

**Verify**: 17 results, matching the table in "Current state". If the count
differs, work from your output — the repo has moved since this plan was
written. If it differs by more than a couple of lines, STOP.

### Step 2: Write the logger

Create `src/lib/logger.ts`. Requirements:

- Emits **one line of JSON** per call, via `console.error` for `error` and
  `console.warn`/`console.log` for the others — Railway captures stdout/stderr,
  so the transport is already correct; only the shape changes.
- Every record carries: `level`, `event`, `msg`, `time` (ISO 8601).
- Accepts arbitrary structured fields.
- Serializes an `Error` into `{ name, message, stack }` rather than `{}` —
  `JSON.stringify(new Error("x"))` produces `{}`, which is the single most
  common way structured logging silently loses the thing you needed.
- Never throws. A logger that can throw turns a handled error into an unhandled
  one, inside a `catch` block, which is the worst possible place.

Target shape:

```ts
type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

/**
 * One structured line per event. `event` is a stable machine-readable name
 * (e.g. "webhook.apply_failed") — log searches filter on it, so treat it as
 * an identifier and do not reword it casually. `msg` is for humans.
 */
export function log(level: Level, event: string, msg: string, fields?: LogFields): void
```

Plus thin wrappers `logInfo`, `logWarn`, `logError` for readability at call
sites.

Error serialization must be explicit:

```ts
function serializeError(e: unknown) {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  return { message: String(e) };
}
```

and any field whose value is an `Error` should be passed through it.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Test the logger

Create `src/lib/logger.test.ts`, modelled on `src/lib/security-headers.test.ts`
(same directory, same plain-Vitest style, no database).

Cases:

1. Emits valid JSON — `JSON.parse` of the captured output succeeds.
2. Includes `level`, `event`, `msg`, `time`.
3. An `Error` field serializes with a non-empty `message` **and** a `stack`
   (this is the regression guard for the `{}` problem).
4. A non-`Error` thrown value (e.g. a string) still produces a usable
   `message`.
5. Never throws when given a value containing a circular reference.

Capture output by spying on `console.error` / `console.warn` with
`vi.spyOn(console, "error").mockImplementation(() => {})` and restoring after.

**Verify**: `pnpm vitest run src/lib/logger.test.ts` → all pass, 5 tests.

### Step 4: Convert the call sites

Work file by file, in this order (smallest blast radius first):

1. `src/server/plugins/monitor-scheduler.ts` (2)
2. `src/lib/scan/scanner.ts` (1)
3. `src/lib/run-monitor.ts` (1)
4. `src/lib/monitor-ticker.ts` (2)
5. `src/lib/auth.ts` (1)
6. `src/routes/api/ingest.ts` (2)
7. `src/routes/api/billing/checkout.ts` (1)
8. `src/routes/api/billing/webhook.ts` (5)

For each, preserve the information that is already there. The existing
subsystem prefix becomes the `event` name; interpolated values become fields.

```ts
// before
console.error(`monitor ${target.id}: run failed`, e);
// after
logError("monitor.run_failed", "Monitor run failed", { monitorId: target.id, error: e });

// before
console.error("webhook: failed to apply event", event.id, event.type, e);
// after
logError("webhook.apply_failed", "Failed to apply Stripe event", {
  stripeEventId: event.id, stripeEventType: event.type, error: e,
});
```

**Do not change control flow.** The `catch` stays, the re-throw or fall-through
stays, the return value stays. Only the logging line changes.

Run `pnpm test` after **each** file, not just at the end — `auth.ts` and
`webhook.ts` are imported by many suites and a mistake there is much cheaper to
find immediately.

**Verify after each file**: `pnpm test` → all pass.

### Step 5: Confirm the conversion is complete

**Verify**:

```
grep -rn "console\." src --include="*.ts" --include="*.tsx" | grep -v test
```

→ exactly **1** result, the `[mail:dev]` line in `src/lib/mailer.ts`.

### Step 6: Full gate

**Verify**, in order, all exit 0:

```
pnpm generate-routes
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Test plan

- **New tests**: 5 in `src/lib/logger.test.ts` (Step 3). The Error-serialization
  case is the one that matters most; the rest are cheap.
- **Structural pattern**: `src/lib/security-headers.test.ts` — same directory
  convention, pure module, no database, plain `describe`/`it`.
- **No new tests for the call sites.** They are one-line substitutions inside
  existing `catch` blocks, and the existing suites (notably
  `src/routes/api/billing/webhook.test.ts`, which asserts on control flow and
  ordering) already prove the surrounding behavior is unchanged. Running them
  after each file is the verification.
- **Verification**: `pnpm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `src/lib/logger.ts` and `src/lib/logger.test.ts` exist
- [ ] `pnpm vitest run src/lib/logger.test.ts` passes with 5 tests
- [ ] `grep -rn "console\." src --include="*.ts" --include="*.tsx" | grep -v test`
      returns exactly 1 result, in `src/lib/mailer.ts`
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all exit 0
- [ ] `pnpm test` exits 0 with no fewer passing tests than before, plus the 5 new
- [ ] `git diff --stat` shows no changes to any `try`/`catch` structure —
      logging lines only
- [ ] `plans/README.md` status row for 054 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The inventory in Step 1 differs substantially from the table above.
- Converting `src/lib/auth.ts` or `src/routes/api/billing/webhook.ts` breaks
  tests in files you did not touch. Both are imported very widely; a failure
  there usually means an import cycle or a server-only boundary violation, not
  a logging bug.
- You conclude a call site needs its control flow changed to log well. It does
  not — log what is available at that point and move on.
- You are tempted to add a logging dependency or wire up an external service.
  Both are explicitly out of scope.

## Maintenance notes

For whoever owns this next:

- **`event` names are an interface.** Once log searches and any future alerts
  filter on them, renaming one silently breaks those. Treat them like route
  paths: additive changes are cheap, renames are not.
- **This plan stops short of request correlation.** There is no request id
  threaded through handlers, so lines from one request still cannot be grouped.
  That is the natural follow-up and is deliberately not attempted here — it
  requires touching every handler signature, which is a much larger change than
  swapping log lines.
- **No external reporting service, deliberately.** If one is added later, note
  that audit records contain customer page content (HTML snippets in
  `violation.nodes`), so anything shipping error context off-box needs a
  privacy review and probably a mention in `src/routes/privacy.tsx`.
- A reviewer should check that no `catch` block changed shape, and that
  `Error` values are passed as fields rather than string-interpolated — the
  latter loses the stack.
