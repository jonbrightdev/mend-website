#!/usr/bin/env node
// Mint an API key for a local user, for testing the extension's dashboard sync
// without clicking through the account page:
//
//   node scripts/create-api-key.mjs you@example.com [key name]
//
// Prints the plaintext key (shown nowhere else — only its hash is stored).
// PGlite is single-connection: stop the dev server before running this.
import { PGlite } from "@electric-sql/pglite";

const email = process.argv[2];
const name = process.argv[3] ?? "local test key";
if (!email) {
  console.error("usage: node scripts/create-api-key.mjs <email> [key name]");
  process.exit(1);
}
if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL is set; this helper only supports the local PGlite database.");
  process.exit(1);
}

// Mirrors src/lib/api-key.ts: mend_ prefix + 32 CSPRNG bytes in base64url,
// stored as a lowercase-hex SHA-256 hash.
function generateKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return "mend_" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashKey(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const db = new PGlite("./.data/pglite");
try {
  const users = await db.query('SELECT id FROM "user" WHERE email = $1', [email]);
  if (users.rows.length === 0) {
    console.error(`No user with email ${email}. Sign up at http://localhost:3000/signup first.`);
    process.exit(1);
  }
  const key = generateKey();
  await db.query(
    'INSERT INTO "apiKey" (id, "userId", "hashedKey", name) VALUES ($1, $2, $3, $4)',
    [crypto.randomUUID(), users.rows[0].id, await hashKey(key), name],
  );
  console.log(key);
} finally {
  await db.close();
}
