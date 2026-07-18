import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { apiKey, audit, violation } from "@/db/schema";
import { hashKey } from "@/lib/api-key";
import { IngestError, parsePayload, groupViolations } from "@/lib/ingest-payload";
import type { IngestPayload } from "@/lib/ingest-payload";
import { createRateLimiter } from "@/lib/rate-limit";

// Accepts the extension's AuditResult payload (../mend-a11y/src/lib/types.ts)
// plus an optional pageTitle. Issues arrive flat (one per affected element)
// and are grouped by rule here to match the portal's Violation shape.
//
// Auth resolves a userId in two ways. The extension can't send a session cookie
// (it's a cross-site request from a chrome-extension:// origin, and the cookie
// is SameSite=Lax), so it sends `Authorization: Bearer <api key>`. We check that
// first, then fall back to the Better Auth session cookie so same-origin callers
// and tests still work.
//
// The extension's request is cross-origin and carries an Authorization header,
// so the browser preflights it. A wildcard origin is safe here: auth is the
// bearer key, never a cookie, and the browser refuses to pair a wildcard with
// credentialed requests anyway.

// Roughly 1 MiB, measured in UTF-16 units rather than bytes — close enough for
// a backstop that no real payload approaches. The extension's largest plausible
// run (1000 issues, html clipped to 500 chars) is an order of magnitude under.
const MAX_BODY_BYTES = 1_000_000;

// Single-node deploy (railway.json runs one process), so an in-process
// limiter is sufficient. Revisit if this ever runs on more than one node.
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function json(data: unknown, status: number): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

// Pulls the bearer token from the Authorization header, if present and shaped
// like our key. Returns null otherwise so we fall through to the cookie path.
function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

// Resolves the acting user: a valid, non-revoked API key wins; otherwise the
// session cookie. Returns null when neither identifies a user.
async function resolveUserId(request: Request): Promise<string | null> {
  const token = bearerToken(request);
  if (token) {
    const hashed = await hashKey(token);
    const [row] = await db
      .select({ id: apiKey.id, userId: apiKey.userId, revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(eq(apiKey.hashedKey, hashed))
      .limit(1);
    if (!row || row.revokedAt) return null;
    // Touch lastUsedAt so the account page can show the key is live. Must be
    // awaited: Drizzle query builders are lazy and only run when awaited, so a
    // fire-and-forget `void db.update(...)` would never actually execute.
    await db
      .update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKey.id, row.id));
    return row.userId;
  }

  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const userId = await resolveUserId(request);
        if (!userId) {
          return json({ error: "Unauthorized" }, 401);
        }

        const verdict = limiter.check(userId);
        if (!verdict.ok) {
          return Response.json(
            { error: "Rate limit exceeded — try again in a minute." },
            {
              status: 429,
              headers: { ...CORS_HEADERS, "Retry-After": String(verdict.retryAfterSeconds) },
            },
          );
        }

        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) {
          return json({ error: "Payload too large" }, 413);
        }

        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }

        let payload: IngestPayload;
        try {
          payload = parsePayload(body);
        } catch (e) {
          if (e instanceof IngestError) {
            return json({ error: e.message }, 400);
          }
          throw e;
        }

        // Both writes go in one transaction: a half-written run would be
        // permanent, since the retry hits the conflict path below and returns
        // success without ever writing the missing violations.
        const auditId = crypto.randomUUID();
        const result = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(audit)
            .values({
              id: auditId,
              userId,
              url: payload.url,
              pageTitle: payload.pageTitle,
              scannedAt: payload.scannedAt,
              durationMs: payload.durationMs,
              totalChecks: payload.totalChecks,
              partial: payload.partial,
            })
            .onConflictDoNothing()
            .returning();

          // Same (user, url, scannedAt) already stored: idempotent success.
          if (inserted.length === 0) return { duplicate: true as const };

          const violations = groupViolations(auditId, payload.issues);
          if (violations.length > 0) {
            await tx.insert(violation).values(violations);
          }
          return { duplicate: false as const, count: violations.length };
        });

        if (result.duplicate) {
          return json({ duplicate: true }, 200);
        }

        return json({ auditId, violations: result.count }, 201);
      },
    },
  },
});
