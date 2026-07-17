# Working agreements

## Branching: work directly on main

Commit straight to `main` and push. Do not open feature branches for planned
work, and do not open pull requests unless asked.

There is one active developer and no parallel workstreams, so branches only
added merge overhead. `main` is the single source of truth.

Because `main` deploys, keep it releasable: run the checks below before pushing,
and push work that is finished rather than parked half-done.

## Toolchain: Node 24 LTS, pnpm from `packageManager`

Run `nvm use` in the repo. `.nvmrc` says `24`, so you get the newest installed
Node 24.x, and CI reads the same file via `node-version-file`. `engines` requires
`>=24`, which is also what Railway's Nixpacks builder reads.

Node 24 is the active LTS — prefer it over the newest release. Node 25 and 26 are
Current, not LTS, and no longer bundle corepack, so the `packageManager` pin
stops being honoured the way it is here.

pnpm's version comes from `packageManager` in package.json — bump it there, not
by installing pnpm globally, so every machine and CI agree.

Older Node fails in a way that doesn't name the real problem. On Node 20,
`pnpm install` dies with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` from inside
corepack: Node 20 bundles corepack 0.23, which loads `pnpm.cjs` without a
dynamic-import callback, and pnpm 11 calls `import()` immediately. It crashes
before pnpm can read `engines`, so the error never mentions Node.

## Dependency pinning

`nitro` is aliased to an exact `nitro-nightly` build, not `@latest`. The stable
`nitro` tag is still an older beta, and TanStack Start + Vite 8 need the nightly
(`vite.config.ts` imports `nitro/vite`). Pin the exact build: with `@latest`,
any `pnpm add` silently re-resolves the server runtime to a different nightly.
To move it, change the version deliberately and check the build.

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
