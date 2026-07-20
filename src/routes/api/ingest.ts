import { createFileRoute } from "@tanstack/react-router";
import { and, count, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { apiKey, audit } from "@/db/schema";
import { hashKey } from "@/lib/api-key";
import { IngestError, parsePayload } from "@/lib/ingest-payload";
import type { IngestPayload } from "@/lib/ingest-payload";
import { storeAuditRun, type StoreResult } from "@/lib/audit-store";
import { createRateLimiter } from "@/lib/rate-limit";
import { getUserEntitlements } from "@/lib/billing-queries";
import { PLAN_LIMITS, type PlanId } from "@/lib/entitlements";
import { maybePurgeOldAudits } from "@/lib/retention";

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
//
// One limiter per plan rather than one limiter with a per-call limit: the
// window state lives inside the limiter, so a single instance would have to
// re-derive the ceiling on every check and a mid-window upgrade would compare
// this minute's Free count against the Pro ceiling. Two instances mean an
// upgrade simply starts a fresh Pro window, which is the accepted behaviour.
const freeLimiter = createRateLimiter({
  limit: PLAN_LIMITS.free.ingestPerMinute,
  windowMs: 60_000,
});
const proLimiter = createRateLimiter({
  limit: PLAN_LIMITS.pro.ingestPerMinute,
  windowMs: 60_000,
});

function checkIngestRate(userId: string, plan: PlanId) {
  return (plan === "pro" ? proLimiter : freeLimiter).check(userId);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

function json(data: unknown, status: number): Response {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

// The extension renders `error` verbatim in its panel, so this is end-user
// copy. It names the cap and the way out, and never implies the extension
// itself is locked — scanning stays free and offline; only cloud storage caps.
function auditCapMessage(entitlements: { plan: PlanId; maxStoredAudits: number }): string {
  const cap = entitlements.maxStoredAudits.toLocaleString("en-US");
  return entitlements.plan === "pro"
    ? `You've reached the ${cap} saved audit limit. Delete older audits to save new ones.`
    : `Free accounts can store up to ${cap} saved audits. Delete old audits or upgrade to Pro on the Pricing page.`;
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
// session cookie. Returns the key row id for key-based auth so the caller can
// touch lastUsedAt — deliberately *after* the rate-limit check, so hammering
// past the limit costs one indexed SELECT, not a write, per request.
async function resolveUser(
  request: Request,
): Promise<{ userId: string; apiKeyId: string | null } | null> {
  const token = bearerToken(request);
  if (token) {
    const hashed = await hashKey(token);
    const [row] = await db
      .select({ id: apiKey.id, userId: apiKey.userId, revokedAt: apiKey.revokedAt })
      .from(apiKey)
      .where(eq(apiKey.hashedKey, hashed))
      .limit(1);
    if (!row || row.revokedAt) return null;
    return { userId: row.userId, apiKeyId: row.id };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  return session ? { userId: session.user.id, apiKeyId: null } : null;
}

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const who = await resolveUser(request);
        if (!who) {
          return json({ error: "Unauthorized" }, 401);
        }
        const { userId, apiKeyId } = who;

        // One indexed read of the subscription mirror, before the limiter, so
        // the plan is available for both the rate ceiling and the audit cap.
        const entitlements = await getUserEntitlements(userId);

        const verdict = checkIngestRate(userId, entitlements.plan);
        if (!verdict.ok) {
          return Response.json(
            { error: "Rate limit exceeded — try again in a minute." },
            {
              status: 429,
              headers: { ...CORS_HEADERS, "Retry-After": String(verdict.retryAfterSeconds) },
            },
          );
        }

        if (apiKeyId) {
          // Touch lastUsedAt so the account page can show the key is live.
          // Must be awaited: Drizzle query builders are lazy and only run when
          // awaited, so a fire-and-forget void would never execute.
          await db
            .update(apiKey)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKey.id, apiKeyId));
        }

        // One UTF-16 unit is at most 3 UTF-8 bytes, so a contract-compliant body
        // (≤ MAX_BODY_BYTES UTF-16 units) can never exceed 3× that in bytes.
        // Reject on the header before buffering; the post-read check below stays
        // authoritative for chunked bodies that carry no Content-Length.
        const contentLength = Number(request.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES * 3) {
          return json({ error: "Payload too large" }, 413);
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

        // Idempotency is checked *before* the cap, deliberately. The extension
        // retries a run it isn't sure landed, and a user sitting at their cap
        // would otherwise see those retries turn into hard 403s for a run that
        // is already safely stored. Same key as the audit_user_url_scanned
        // unique index, so this agrees with the conflict path below.
        const [alreadyStored] = await db
          .select({ id: audit.id })
          .from(audit)
          .where(
            and(
              eq(audit.userId, userId),
              eq(audit.url, payload.url),
              eq(audit.scannedAt, payload.scannedAt),
            ),
          )
          .limit(1);
        if (alreadyStored) {
          return json({ duplicate: true }, 200);
        }

        // Only a would-be new row can exceed the cap. Infinity means legacy
        // free (FREE_LIMITS_ENFORCED unset), where there is nothing to count.
        if (Number.isFinite(entitlements.maxStoredAudits)) {
          const [stored] = await db
            .select({ total: count() })
            .from(audit)
            .where(eq(audit.userId, userId));
          if ((stored?.total ?? 0) >= entitlements.maxStoredAudits) {
            return json({ error: auditCapMessage(entitlements), code: "AUDIT_CAP" }, 403);
          }
        }

        // The write itself lives in audit-store.ts, shared with the monitor
        // scanner so both produce identical rows.
        let result: StoreResult;
        try {
          result = await storeAuditRun(userId, payload);
        } catch (e) {
          // Without this, the framework's bare 500 has no CORS headers and the
          // extension surfaces an opaque network error instead of our message.
          console.error("ingest: failed to store audit", e);
          return json({ error: "Something went wrong saving this audit. Please try again." }, 500);
        }

        if (result.duplicate) {
          return json({ duplicate: true }, 200);
        }

        // Lazy retention: a successful new write is the only trigger, and the
        // purge throttles itself to once a day per user. Never allowed to fail
        // an ingest that already committed — the caller's audit is stored.
        try {
          await maybePurgeOldAudits(userId, entitlements.auditRetentionDays);
        } catch (e) {
          console.error("ingest: retention purge failed", e);
        }

        return json({ auditId: result.auditId, violations: result.count }, 201);
      },
    },
  },
});
