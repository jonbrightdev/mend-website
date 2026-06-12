# Mend

**Find what's broken on your page, and exactly how to fix it.**

Mend is a free, open-source Chrome extension that audits the page you're viewing against WCAG. It shows you what's wrong, where it lives, and how to fix it — in plain language, with nothing sent off your device.

[**Add to Chrome**](https://chromewebstore.google.com/detail/mend-accessibility-audit/iihcbcolbnbbccohpcendeneofimpcmo)

## What you get

- **Fix-first guidance** — every issue leads with what to change, not a wall of rule IDs
- **Plain-language explanations** — hand-written docs with before/after examples where we've covered the rule
- **Runs on your machine** — no accounts, no API keys, no telemetry
- **Side panel workflow** — open Mend beside any tab, run an audit, highlight issues on the page

## Site

This repo is the Mend website and portal: marketing pages (home, privacy, support) plus an optional account area where signed-in users can save audits and track violations across pages and runs.

Built with [TanStack Start](https://tanstack.com/start) (Vite + TanStack Router), [Better Auth](https://better-auth.com), and [Drizzle ORM](https://orm.drizzle.team) over Postgres.

### Run it locally

No external services needed — without a `DATABASE_URL`, the app uses [PGlite](https://pglite.dev) (embedded Postgres persisted to `./.data/pglite`).

```bash
pnpm install
cp .env.example .env   # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:push           # create tables (once)
pnpm dev               # http://localhost:3000
```

To use a real Postgres server instead, set `DATABASE_URL` in `.env` and run `pnpm db:push` again.

Production: `pnpm build`, then `node .output/server/index.mjs`.

Extension source: [github.com/jpreecedev/mend-a11y](https://github.com/jpreecedev/mend-a11y)

## License

MIT
