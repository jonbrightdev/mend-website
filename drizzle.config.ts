import { mkdirSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Mirrors src/db/index.ts: a real Postgres when DATABASE_URL is set, otherwise
// the embedded PGlite database in ./.data/pglite.
const databaseUrl = process.env.DATABASE_URL;

// PGlite creates its data dir but not parents (see src/db/index.ts).
if (!databaseUrl) mkdirSync("./.data", { recursive: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(databaseUrl
    ? { dbCredentials: { url: databaseUrl } }
    : { driver: "pglite", dbCredentials: { url: "./.data/pglite" } }),
});
