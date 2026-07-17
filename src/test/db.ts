// In-memory Postgres for tests. Call createTestDb() BEFORE importing any
// module that imports "@/db": src/db/index.ts binds `db` to
// globalThis.__mendDb ??= ..., so pre-setting the global makes the entire
// app use this instance. Schema comes from replaying drizzle/*.sql in order,
// so new migrations are picked up automatically.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "@/db/schema";

export async function createTestDb() {
  const client = new PGlite(); // no data dir → in-memory
  const dir = join(process.cwd(), "drizzle");
  const migrations = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of migrations) {
    // drizzle-kit separates statements with this marker in generated SQL.
    const sql = readFileSync(join(dir, file), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  const db = drizzle(client, { schema });
  (globalThis as Record<string, unknown>).__mendDb = db;
  return db;
}
