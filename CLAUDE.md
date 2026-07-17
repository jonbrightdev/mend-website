# Working agreements

## Branching: work directly on main

Commit straight to `main` and push. Do not open feature branches for planned
work, and do not open pull requests unless asked.

There is one active developer and no parallel workstreams, so branches only
added merge overhead. `main` is the single source of truth.

Because `main` deploys, keep it releasable: run the checks below before pushing,
and push work that is finished rather than parked half-done.

## Node version: use 24

Run `nvm use` in the repo — `.nvmrc` pins Node 24, which is what CI installs.

Older Node will fail in a way that doesn't name the real problem. On Node 20,
`pnpm install` dies with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` from inside
corepack: Node 20 bundles corepack 0.23, which loads `pnpm.cjs` without a
dynamic-import callback, and pnpm 11 calls `import()` immediately. It crashes
before pnpm can read `engines`, so the error never mentions the Node version.
Node 25 doesn't bundle corepack at all. Stay on 24.

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
