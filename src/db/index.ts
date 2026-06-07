import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A single shared pool. node-postgres connects lazily on first query, so
// importing this module is safe at build time even without DATABASE_URL set.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
