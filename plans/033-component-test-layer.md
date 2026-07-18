# Plan 033: Add a component-test layer and cover the dashboard and account interactions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0be29dc..HEAD -- vitest.config.ts src/components/DashboardClient.tsx src/components/AccountClient.tsx package.json`
> `AccountClient.tsx` is *expected* to have drifted if plan 028 ran first (it
> adds a `hasPassword` prop and an OAuth deletion branch) — read the live
> component before writing its tests. Any drift in `DashboardClient.tsx` or
> `vitest.config.ts` beyond plan 032's package.json edits: compare against the
> excerpts and STOP on mismatch.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/028-oauth-account-deletion.md (AccountClient props);
  plans/032-lint-gate.md (run `pnpm lint` if it exists)
- **Category**: tests
- **Planned at**: commit `0be29dc`, 2026-07-18

## Why this matters

The repo's server side is well tested (216 tests: parsing, contract, queries,
rate limiting, auth flows against in-memory Postgres), but the interactive
client layer has zero coverage and zero infrastructure to write any: vitest
runs in `node` environment and only includes `*.test.ts`. The riskiest
untested logic is `DashboardClient`'s combined filtering (scope × search ×
impact chips feed three different derived row sets — `tableRows`, `asideRows`,
`rules` — each combining the filters differently) and `AccountClient`'s
destructive two-click danger zone. Regressions here ship silently today. This
plan adds the minimal infra (jsdom + Testing Library, opt-in per file) and
covers those two components.

## Current state

- `vitest.config.ts` today:

```ts
import { defineConfig } from "vitest/config";

// `@/*` resolves from tsconfig's paths, the same way vite.config.ts does it.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- `src/components/DashboardClient.tsx` — pure-props component
  (`{ audits, runDates }`), no data fetching of its own. Uses
  `Link` from `@tanstack/react-router` (several link targets), `localStorage`
  for layout persistence, and pure helpers from `@/lib/dashboard-data` (those
  helpers are already unit-tested in `src/lib/dashboard-data.test.ts` — do not
  re-test them; test the *composition*). Filter derivations at lines 228-284:
  `scopedAudits` (scope only), `rules` (scope + impact chips), `tableRows`
  (scope + search + impact), `asideRows` (search only).
- `src/components/AccountClient.tsx` — calls the server functions
  `createApiKey`, `revokeApiKey`, `deleteAllAudits` from `@/lib/account-fns`
  and `authClient.deleteUser` from `@/lib/auth-client`. In a jsdom test these
  must be mocked — the server-fn RPC stubs would otherwise try to `fetch`.
- The `AuditRecord` shape tests will need (from `src/lib/dashboard-data.ts`):

```ts
interface AuditRecord {
  id: string;
  url: string;
  pageTitle: string;
  scannedAt: string; // ISO datetime
  history: number[];
  violations: Violation[]; // { id: ruleId, impact, help, helpUrl, description, tags, nodes }
}
// ViolationNode: { target: string; html: string; failureSummary: string }
```

- Existing test conventions: `describe`/`it` from vitest, `vi.mock` at module
  top (see `src/lib/auth-verification.test.ts:12` for the mock-the-mailer
  pattern), plain assertions, no snapshot tests.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Install   | `pnpm add -D jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom` | exit 0 |
| One suite | `pnpm test src/components/DashboardClient.test.tsx` | all pass       |
| All tests | `pnpm test`                                    | all pass            |
| Typecheck | `pnpm typecheck`                               | exit 0              |
| Lint      | `pnpm lint` (only if the script exists)        | exit 0              |

## Scope

**In scope**:
- `package.json` / `pnpm-lock.yaml` (devDependencies)
- `vitest.config.ts` (include pattern)
- `src/components/DashboardClient.test.tsx` (create)
- `src/components/AccountClient.test.tsx` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `src/components/DashboardClient.tsx`, `src/components/AccountClient.tsx` —
  this plan adds tests around current behavior; if a test reveals a bug,
  record it in your report, do not fix the component.
- All existing `*.test.ts` files and `src/test/db.ts`.
- No router integration testing (`RouterProvider`, route trees) — `Link` is
  mocked (below) by decision, to keep the layer thin.

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Commit message style: single imperative sentence, e.g.
  `Add component tests for the dashboard and account clients`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Infrastructure

1. Install the devDependencies (command table above).
2. In `vitest.config.ts`, change the include to
   `include: ["src/**/*.test.{ts,tsx}"]`. Keep `environment: "node"` as the
   default — component tests opt in per file with a leading comment:

```ts
// @vitest-environment jsdom
```

This keeps the 13 existing node-environment suites byte-for-byte unaffected.

**Verify**: `pnpm test` → existing 216 tests still pass (nothing new included
yet).

### Step 2: DashboardClient tests

Create `src/components/DashboardClient.test.tsx`, starting with
`// @vitest-environment jsdom`. Mock `Link` so no router is needed — mock
**partially**, keeping everything else real:

```tsx
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ to, params, children, ...rest }: any) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>{children}</a>
  ),
}));
```

Build a small fixture: 2–3 `AuditRecord`s with distinct URLs, page titles, and
violations across at least two impact levels (shape inlined in Current state;
`helpUrl` can be `""`, `tags` `[]`). `runDates`: 2 dates.

Cover at least:

1. **Empty state**: `audits={[]}` renders "No audits yet".
2. **Search narrows the pages table**: type into the "Filter pages by URL…"
   input (`userEvent.type`), assert only matching page rows remain in the
   table, and non-matching are gone.
3. **Impact chip filters the rule list**: click the "Critical" chip
   (`aria-pressed` flips to `true`), assert rules with other impacts disappear
   from "Top issues by rule" and the live-region text (`role="status"`)
   updates to mention `critical`.
4. **Scope select narrows stats**: select a URL in the `Scope` combobox,
   assert the scope banner ("Scoped to …") appears and "Total violations"
   shows that page's node total, then click "Show all pages" and assert the
   banner clears.
5. **Search + impact compose**: with both active, table shows only rows
   matching both.

Query by accessible role/name (`getByRole("searchbox")`,
`getByRole("button", { name: /critical/i })`, `getByRole("combobox")`) —
matching the product's accessibility positioning.

**Verify**: `pnpm test src/components/DashboardClient.test.tsx` → all pass.

### Step 3: AccountClient tests

Create `src/components/AccountClient.test.tsx` with the jsdom pragma. Mock the
server-fn module and the auth client at the top:

```tsx
vi.mock("@/lib/account-fns", () => ({
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  deleteAllAudits: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { deleteUser: vi.fn() },
}));
```

**Read the live `AccountClient.tsx` first** — if plan 028 landed, the
component takes `hasPassword` and has two deletion branches; write the tests
against what exists. Cover at least:

1. **Key generation reveal-once**: `createApiKey` resolves
   `{ key: "mend_abc", keys: [...] }` → clicking "Generate a key" shows the
   key in the readonly input; clicking "Done" hides it.
2. **Revoke updates the list**: `revokeApiKey` resolves a shorter list →
   clicking Revoke re-renders without that key.
3. **Server-fn failure shows the alert**: `createApiKey` rejects → the
   `role="alert"` error appears.
4. **Danger zone is two-click**: `deleteAllAudits` is *not* called on the
   first click ("Delete all synced audits" arms), only after the confirm
   click; Cancel disarms without calling it.
5. **Account deletion gating**: password branch — submit stays disabled until
   a password is typed; (if `hasPassword` exists post-028) OAuth branch —
   no password field is rendered and `authClient.deleteUser` is called with
   `{}`.

**Verify**: `pnpm test src/components/AccountClient.test.tsx` → all pass.

### Step 4: Full gate

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass (216 existing +
new); `pnpm lint` → exit 0 (skip if the script doesn't exist).

## Test plan

This plan *is* the test plan — Steps 2–3 enumerate the cases. Structural
pattern: vitest `describe`/`it` like the existing suites; Testing Library
idioms are new to this repo, so prefer the simplest queries that work by
role/name.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0; ≥10 new tests across the two new files
- [ ] Existing suites unchanged (`git diff --stat` shows no `*.test.ts` edits)
- [ ] `pnpm typecheck` exits 0
- [ ] Component source files unmodified (`git diff src/components/*.tsx` empty
      apart from the two new `.test.tsx` files)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- React 19 / Testing Library version incompatibility surfaces at install or
  first render (peer-dep errors, `act` warnings that fail tests) and isn't
  resolved by installing the current latest versions — report versions rather
  than downgrading React.
- The partial mock of `@tanstack/react-router` breaks because the component
  uses more router exports than `Link` — check its imports first; if it pulls
  hooks that need real router context, report instead of mocking deeper.
- A test reveals an actual behavior bug in either component — record it,
  leave the component untouched, and note it for the maintainer.

## Maintenance notes

- The jsdom environment is opt-in per file (`// @vitest-environment jsdom`).
  Keep it that way: the DB-backed suites depend on node environment.
- When plan 034 extracts `TrendChart` into its own file, the DashboardClient
  tests keep passing (the chart renders inside it either way); a dedicated
  TrendChart test is a natural follow-up, not included here.
- These tests intentionally mock the server-fn boundary. If the server fns'
  return shapes change, the mocks drift silently — the server-side tests in
  `src/lib/account-fns.test.ts` are the guard on that side; keep both updated
  together.
