# Plan 031: Make the docs bootstrap with `db:migrate`, not `db:push`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0be29dc..HEAD -- README.md .env.example src/db/index.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `0be29dc`, 2026-07-18

## Why this matters

This repo was bitten once by `db:push`: tables pushed locally but never
generated as migrations were absent from the deployed database (fixed in
migration `0001_public_slapstick.sql`; the incident is recorded in
`CLAUDE.md` and `plans/README.md`). `CLAUDE.md` now mandates generated
migrations — yet the README, `.env.example`, and a comment in `src/db/index.ts`
still tell every new contributor to run `pnpm db:push`. Someone following the
README bootstraps a schema that never exercises the committed migrations, and
normalizes exactly the habit that caused the incident. `pnpm db:migrate` works
for both drivers (`drizzle.config.ts` configures `driver: "pglite"` when
`DATABASE_URL` is unset), replays the committed `drizzle/*.sql`, and is what
Railway runs in production (`railway.json` `preDeployCommand`) — the docs
should say that.

## Current state

Relevant files and the exact lines to change:

- `README.md:34-42`:

```
```bash
pnpm install
cp .env.example .env   # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:push           # create tables (once)
pnpm dev               # http://localhost:3000
```

To use a real Postgres server, set `DATABASE_URL` in `.env` and run `pnpm
db:push` again. For production: `pnpm build`, then `node .output/server/index.mjs`.
```

- `.env.example` (DATABASE_URL block): "Either way, run `pnpm db:push` once to
  create the tables."
- `src/db/index.ts:12` (inside the two-drivers comment):
  "Run `pnpm db:push` once to create tables (works for both drivers)."

Facts to preserve when rewording:

- `pnpm db:migrate` = `drizzle-kit migrate`; it replays `drizzle/*.sql` and
  records them in drizzle's migrations table. On a **fresh** database it fully
  bootstraps the schema. The test harness (`src/test/db.ts`) proves this on
  every run by replaying the same files into in-memory PGlite.
- A PGlite data dir previously created via `db:push` has the tables but no
  migrations bookkeeping — running `db:migrate` against it can fail on
  "already exists". The docs are for fresh setups, so recommend deleting
  `./.data` if switching an old push-created local database over.
- `pnpm db:push` stays in `package.json` — `CLAUDE.md` references it and it
  remains legitimate for throwaway experimentation; only the *recommended
  bootstrap path* changes.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass            |

## Scope

**In scope** (the only files you should modify):
- `README.md`
- `.env.example`
- `src/db/index.ts` (comment only — no code change)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `package.json` — the `db:push` script stays.
- `CLAUDE.md` — already correct.
- `drizzle.config.ts`, `drizzle/` — no schema or config changes.
- `scripts/create-api-key.mjs`.

## Git workflow

- Work directly on `main` (repo agreement — no feature branches, no PRs).
- Commit message style: single imperative sentence, e.g.
  `Point the setup docs at db:migrate instead of db:push`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: README

Replace `pnpm db:push           # create tables (once)` with
`pnpm db:migrate        # create tables (replays drizzle/ migrations)` and
rewrite the follow-up sentence to:

"To use a real Postgres server, set `DATABASE_URL` in `.env` and run
`pnpm db:migrate` again. (If you previously created `./.data` with `db:push`,
delete it first — `db:migrate` expects to own the schema from scratch.)"

Keep the production sentence unchanged.

**Verify**: `grep -n "db:push" README.md` → 0 matches (the parenthetical above
mentions it once — that single historical mention is acceptable; if you kept
it, expect 1 match and confirm it is the parenthetical).

### Step 2: .env.example

In the DATABASE_URL block, change "Either way, run `pnpm db:push` once to
create the tables." to "Either way, run `pnpm db:migrate` once to create the
tables."

**Verify**: `grep -n "db:push" .env.example` → 0 matches.

### Step 3: src/db/index.ts comment

Change the comment line "Run `pnpm db:push` once to create tables (works for
both drivers)." to "Run `pnpm db:migrate` once to create tables (works for
both drivers)." No code changes in this file.

**Verify**: `git diff src/db/index.ts` shows only comment lines changed;
`pnpm typecheck` → exit 0.

### Step 4: Prove the migrate path bootstraps a fresh database

The test suite replays `drizzle/*.sql` into a fresh in-memory PGlite —
identical inputs to what `db:migrate` applies:

**Verify**: `pnpm test` → all pass (in particular `src/test/db.test.ts`).

## Test plan

No new tests — this is a docs/comment change. The existing
`src/test/db.test.ts` already asserts the migrations bootstrap a fresh schema.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "db:push" README.md .env.example src/db/index.ts` → at most the
      single historical parenthetical in README.md
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpted lines are no longer present where indicated.
- You find additional `db:push` recommendations outside the three in-scope
  files (other than `package.json` and `CLAUDE.md`) — report them rather than
  expanding scope.

## Maintenance notes

- If drizzle-kit ever changes its migrations-bookkeeping table or the
  `driver: "pglite"` config shape, the README claim "works for both drivers"
  must be re-verified.
- The "delete ./.data first" caveat exists because push-created local
  databases predate migrate bookkeeping; once all active checkouts have
  migrated, the caveat can be dropped.
