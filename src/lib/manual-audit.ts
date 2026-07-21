import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKey, manualAudit, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hashKey } from "@/lib/api-key";

// Shared plumbing for the /api/manual/* routes used by the mend-manual-helper
// auditor extension. Auth mirrors /api/ingest: the extension sends
// `Authorization: Bearer <api key>` (a chrome-extension:// origin can't carry
// the SameSite=Lax session cookie), with a session-cookie fallback for
// same-origin callers and tests. On top of that every manual route requires
// user.isAuditor — these endpoints are internal-team only.

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export function json(data: unknown, status: number): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Resolves the acting user (API key first, then session cookie) and requires
 * isAuditor. Returns null for anyone else — routes turn that into a 401; we
 * deliberately don't distinguish "unknown key" from "not an auditor".
 */
export async function requireAuditor(request: Request): Promise<{ userId: string } | null> {
  let userId: string | null = null;

  const token = bearerToken(request);
  if (token) {
    const hashed = await hashKey(token);
    const [row] = await db
      .select({ userId: apiKey.userId, revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(eq(apiKey.hashedKey, hashed))
      .limit(1);
    if (!row || row.revokedAt) return null;
    userId = row.userId;
  } else {
    const session = await auth.api.getSession({ headers: request.headers });
    userId = session?.user.id ?? null;
  }
  if (!userId) return null;

  const [who] = await db
    .select({ isAuditor: user.isAuditor })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return who?.isAuditor ? { userId } : null;
}

/**
 * Fetches an audit only if this auditor owns it — the authorization check for
 * every nested write (pages, checks, findings, dismissals).
 */
export async function auditForAuditor(auditId: string, auditorUserId: string) {
  const [row] = await db.select().from(manualAudit).where(eq(manualAudit.id, auditId)).limit(1);
  return row && row.auditorUserId === auditorUserId ? row : null;
}

/* ============================================================
   Screenshot store. Filesystem for now (SCREENSHOT_DIR, default
   ./.data/screenshots) — swap for S3/R2 behind these two
   functions when the deploy needs it. Keys are server-generated
   UUID-based names, never caller input, so no path traversal.
   ============================================================ */

const screenshotDir = () => process.env.SCREENSHOT_DIR ?? "./.data/screenshots";

// ~4 MB of PNG; a cropped element screenshot is far under this.
export const MAX_SCREENSHOT_BASE64 = 6_000_000;

/**
 * Stores a base64 PNG (with or without a data: prefix) under a fresh key.
 * Returns the key to persist on the finding.
 */
export async function saveScreenshot(base64: string): Promise<string> {
  const data = base64.replace(/^data:image\/png;base64,/, "");
  const key = `${crypto.randomUUID()}.png`;
  await mkdir(screenshotDir(), { recursive: true });
  await writeFile(join(screenshotDir(), key), Buffer.from(data, "base64"));
  return key;
}

/** Reads a stored screenshot; null if the key doesn't exist. */
export async function readScreenshot(key: string): Promise<Buffer | null> {
  // Belt-and-braces: keys are our UUIDs, but never join caller input blindly.
  if (!/^[0-9a-f-]+\.png$/.test(key)) return null;
  try {
    return await readFile(join(screenshotDir(), key));
  } catch {
    return null;
  }
}
