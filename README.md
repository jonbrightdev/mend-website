# Mend

**Find what's broken on your page, and exactly how to fix it.**

Mend is a free, open-source Chrome extension that audits the page you're viewing
against WCAG and shows you what's wrong, where it lives, and how to fix it — in
plain language, with copy-paste examples.

[**Add to Chrome**](https://chromewebstore.google.com/detail/mend-accessibility-audit/iihcbcolbnbbccohpcendeneofimpcmo)

## What you get

- **Fix-first guidance** — every issue leads with what to change, not a wall of jargon
- **Plain-language explanations** — with before/after examples you can copy and paste
- **Private by default** — no account needed and no telemetry; your pages stay in your browser
- **An optional dashboard** — connect a free account to save the audits you choose and track issues across pages and over time (free, with a paid Pro tier for longer history and more headroom; the extension is free either way)

## About this repo

This is the Mend website and portal: the marketing pages (home, privacy,
support) plus an optional account area where signed-in users can save audits
from the extension and watch their violations go down over time.

The extension itself lives at
[github.com/jpreecedev/mend-a11y](https://github.com/jpreecedev/mend-a11y).

### Run it locally

Built with [TanStack Start](https://tanstack.com/start),
[Better Auth](https://better-auth.com), and [Drizzle ORM](https://orm.drizzle.team).
No external services needed — without a `DATABASE_URL` it uses embedded Postgres
([PGlite](https://pglite.dev)).

```bash
pnpm install
cp .env.example .env   # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:migrate        # create tables (replays drizzle/ migrations)
pnpm dev               # http://localhost:3000
```

To use a real Postgres server, set `DATABASE_URL` in `.env` and run
`pnpm db:migrate` again. (If you previously created `./.data` with `db:push`,
delete it first — `db:migrate` expects to own the schema from scratch.) For
production: `pnpm build`, then `node .output/server/index.mjs`.

## License

MIT
