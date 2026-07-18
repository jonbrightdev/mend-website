# Plan 032: Add a lint gate (Biome) to the toolchain and CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0be29dc..HEAD -- package.json .github/workflows/ci.yml CLAUDE.md`
> Source files will have drifted if plans 028–031 ran first — that is expected;
> what matters is that no lint config already exists (`ls biome.json
> biome.jsonc eslint.config.* .eslintrc* 2>/dev/null` → nothing). If one
> exists, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (execute after 028–031 so their code is linted too)
- **Category**: dx
- **Planned at**: commit `0be29dc`, 2026-07-18

## Why this matters

The repo's verification chain is install → generate-routes → typecheck → test →
build. Nothing catches unused imports/variables, accidental implicit `any`
leaks the compiler tolerates, `==` comparisons, or React-hooks dependency
mistakes. Most code here is written by executor agents working from plans;
a mechanical lint gate is disproportionately valuable in that setup because it
catches the exact class of small mistakes weaker executors make, at zero
ongoing cost. Biome is chosen over ESLint deliberately: one devDependency, one
config file, fast, and its recommended rule set includes React-hooks
correctness checks — a good fit for a solo repo with no existing lint culture.

## Current state

- No lint or formatter config exists anywhere in the repo (verified at
  `0be29dc`: no `biome.json`, no `eslint*`, no `.prettierrc`).
- `package.json` scripts today: `dev`, `build`, `start`, `generate-routes`,
  `typecheck`, `test`, `db:generate`, `db:migrate`, `db:push`.
- CI (`.github/workflows/ci.yml`) steps today, in order:
  `pnpm install --frozen-lockfile` → `pnpm generate-routes` → `pnpm typecheck`
  → `pnpm test` → `pnpm build`.
- `src/routeTree.gen.ts` is generated and gitignored — it must be excluded
  from linting.
- Code style in the repo: 2-space indent, double quotes, semicolons, trailing
  commas. (Relevant only so lint fixes don't fight the existing style; the
  formatter stays **off** in this plan.)
- The codebase deliberately uses non-null assertions in a few
  bounds-guaranteed spots (e.g. `group[0]!` in `src/lib/ingest-payload.ts:157`,
  `urlRuns[urlRuns.length - 1]!` in `src/lib/dashboard-queries.ts:90,104`).
  If a recommended rule flags these, configure that rule off rather than
  rewriting correct code.
- `CLAUDE.md`'s "Checks before pushing" section lists the CI commands — it
  must gain the lint step too.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Install   | `pnpm add -D -E @biomejs/biome`           | exit 0; exact version pinned in package.json |
| Lint      | `pnpm lint`                               | exit 0 when clean   |
| Safe fixes| `pnpm exec biome lint --write .`          | applies only safe fixes |
| Typecheck | `pnpm typecheck`                          | exit 0              |
| Tests     | `pnpm test`                               | all pass            |
| Build     | `pnpm build`                              | exit 0              |

## Scope

**In scope**:
- `package.json` (devDependency + `lint` script)
- `pnpm-lock.yaml` (via install)
- `biome.json` (create)
- `.github/workflows/ci.yml` (one added step)
- `CLAUDE.md` ("Checks before pushing" list)
- Source files under `src/` and `scripts/` — **only** edits needed to satisfy
  lint rules kept enabled
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- No repo-wide reformat: Biome's **formatter stays disabled** in `biome.json`.
  A format-everything diff obscures history for no correctness gain; if the
  maintainer wants it later, it's a one-line config change plus one commit.
- No behavioral changes while fixing lint findings — if a fix would change
  behavior (not just dead code/imports), leave the finding, disable the rule,
  and list it in your report.
- `drizzle/`, `contract/`, `plans/`, `src/routeTree.gen.ts`.

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Two commits: (1) tooling (`Add a Biome lint gate to CI`), (2) lint fixes if
  any (`Fix lint findings across src/`). One commit is fine if fixes are tiny.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Install and configure

`pnpm add -D -E @biomejs/biome` (exact pin, matching how the repo pins other
sharp tools). Create `biome.json`:

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "includes": ["src/**", "scripts/**", "*.ts"] },
  "formatter": { "enabled": false },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  }
}
```

Notes: `useIgnoreFile: true` makes Biome honour `.gitignore`, which already
excludes `src/routeTree.gen.ts`, `.output`, etc. Check the schema key names
against the installed version's docs (`pnpm exec biome --help` /
`configuration_schema.json`) — Biome has renamed config keys across majors; if
`files.includes` is rejected, the installed major uses `files.include` — adapt
to what the schema file in `node_modules` actually declares.

Add the script to `package.json`: `"lint": "biome lint ."`.

**Verify**: `pnpm lint` runs and reports (exit code may be non-zero at this
point — that's the next step).

### Step 2: Drive the repo to lint-clean

1. `pnpm exec biome lint --write .` (safe fixes only).
2. Re-run `pnpm lint`. For each remaining diagnostic, either fix it by hand
   (dead imports, unused vars, trivial correctness) or — when the rule fights
   a deliberate repo idiom (see the non-null-assertion note above) —
   disable that one rule in `biome.json` with a JSON-adjacent comment not
   being available, keep a list: every disabled rule goes into your completion
   report *and* into the Maintenance notes of the `plans/README.md` status row
   line for this plan (one line: which rules were disabled and why).
3. Guardrail: if more than ~10 distinct rules need disabling, or any single
   fix is not obviously behavior-preserving, STOP and report the diagnostic
   list instead of pushing through.

**Verify**: `pnpm lint` → exit 0; then `pnpm typecheck`, `pnpm test`,
`pnpm build` all → exit 0 (lint fixes must not break anything).

### Step 3: Wire CI and CLAUDE.md

In `.github/workflows/ci.yml`, add `- run: pnpm lint` between the
`pnpm typecheck` and `pnpm test` steps. (After typecheck: type errors give
better messages than lint noise when both fire.)

In `CLAUDE.md`, "Checks before pushing": add `pnpm lint` to the command list
in the same position (after `pnpm typecheck`).

**Verify**: `grep -n "pnpm lint" .github/workflows/ci.yml CLAUDE.md` → one
match in each.

## Test plan

No new tests. The gate itself is the artifact; the full existing suite plus
build must stay green after any lint-driven source edits.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build` all exit 0
- [ ] `package.json` has an exact-pinned `@biomejs/biome` and a `lint` script
- [ ] `.github/workflows/ci.yml` and `CLAUDE.md` both reference `pnpm lint`
- [ ] `git diff` contains no formatting-only churn (formatter disabled)
- [ ] Disabled rules (if any) are listed in the completion report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A lint config already exists (drift check).
- Step 2's guardrail trips (>~10 rules need disabling, or fixes stop being
  obviously behavior-preserving).
- The installed Biome's config schema differs so much from the Step 1 sketch
  that `files`/`linter` scoping can't be expressed — report the version and
  schema instead of guessing.
- `pnpm add` wants to change `packageManager` or any existing dependency
  version — install must only add the one devDependency.

## Maintenance notes

- The formatter is off by choice, not omission. Enabling it later is
  `"formatter": { "enabled": true }` plus one whole-repo commit — do it in a
  quiet moment, never mixed into a feature change.
- Executors of later plans must run `pnpm lint` before finishing — plans
  033/034 list it in their command tables.
- When Biome majors are bumped, re-check the config keys (they have renamed
  before) and re-run the full gate.
