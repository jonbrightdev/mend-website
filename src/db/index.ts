import { mkdirSync } from "node:fs";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

// Two drivers, one boundary:
//  - DATABASE_URL set      → node-postgres against a real server.
//  - DATABASE_URL missing  → PGlite, an embedded Postgres persisted to
//    ./.data/pglite, so the whole stack runs locally with zero services.
// Run `pnpm db:push` once to create tables (works for both drivers).
//
// PGlite is single-connection: only one instance may hold the data dir.
// The globalThis cache keeps Vite dev-server module reloads from opening
// a second instance in the same process (which corrupts the dir). Don't
// run two servers, or db:push while the app is running, in PGlite mode.
const databaseUrl = process.env.DATABASE_URL;

function createDb() {
  if (databaseUrl) {
    return drizzlePg(new Pool({ connectionString: databaseUrl }), { schema });
  }
  // PGlite creates its data dir but not parents; make sure ./.data exists.
  mkdirSync("./.data", { recursive: true });
  return drizzlePglite(new PGlite("./.data/pglite"), { schema });
}

const g = globalThis as typeof globalThis & { __mendDb?: ReturnType<typeof createDb> };

export const db = (g.__mendDb ??= createDb());
