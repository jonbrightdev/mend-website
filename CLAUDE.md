# Working agreements

## Branching: work directly on main

Commit straight to `main` and push. Do not open feature branches for planned
work, and do not open pull requests unless asked.

There is one active developer and no parallel workstreams, so branches only
added merge overhead. `main` is the single source of truth.

Because `main` deploys, keep it releasable: run the checks below before pushing,
and push work that is finished rather than parked half-done.

## Checks before pushing

Run what CI runs (`.github/workflows/ci.yml`) — all four must pass:

```
pnpm install --frozen-lockfile
pnpm generate-routes
pnpm typecheck
pnpm test
pnpm build
```

`pnpm generate-routes` matters on a fresh checkout: `src/routeTree.gen.ts` is
gitignored, and `typecheck` fails without it. Locally it usually already exists,
which means typecheck can pass on your machine and still fail in CI.

## Database schema changes

Use `pnpm db:generate` to produce a migration under `drizzle/`, and commit it.

Do not use `pnpm db:push` for schema changes. `railway.json` runs
`pnpm db:migrate` as its pre-deploy command, so anything that exists only from a
local `push` is absent in the deployed database. This bit us once already: the
`audit`, `apiKey` and `violation` tables had been pushed but never generated, so
they appeared in no migration (fixed in `0001_public_slapstick.sql`).

The test harness in `src/test/db.ts` replays every `drizzle/*.sql` into an
in-memory PGlite database, so a missing migration fails the suite too.

## Plans

`plans/` holds implementation plans with a status table in `plans/README.md`.
Each plan is self-contained — read it fully, honour its STOP conditions, and
update its status row when done.
