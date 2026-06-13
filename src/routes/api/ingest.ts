import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { apiKey, audit, violation } from "@/db/schema";
import { hashKey } from "@/lib/api-key";
import type { Impact, ViolationNode } from "@/lib/dashboard-data";

// Accepts the extension's AuditResult payload (../mend-a11y/src/lib/types.ts)
// plus an optional pageTitle. Issues arrive flat (one per affected element)
// and are grouped by rule here to match the portal's Violation shape.
//
// Auth resolves a userId in two ways. The extension can't send a session cookie
// (it's a cross-site request from a chrome-extension:// origin, and the cookie
// is SameSite=Lax), so it sends `Authorization: Bearer <api key>`. We check that
// first, then fall back to the Better Auth session cookie so same-origin callers
// and tests still work.

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
    // Best-effort touch so the user can see the key is live; don't block on it.
    void db
      .update(apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKey.id, row.id));
    return row.userId;
  }

  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

const IMPACTS = new Set<string>(["critical", "serious", "moderate", "minor"]);

interface IngestIssue {
  ruleId: string;
  impact: Impact;
  category: string;
  wcag: string[];
  title: string;
  description: string;
  helpUrl?: string;
  selector: string;
  html: string;
  failureSummary?: string;
  domOrder: number;
}

interface IngestPayload {
  url: string;
  pageTitle: string;
  scannedAt: Date;
  durationMs?: number;
  totalChecks?: number;
  partial: boolean;
  issues: IngestIssue[];
}

function bad(message: string): never {
  throw new IngestError(message);
}

class IngestError extends Error {}

function str(v: unknown, field: string, opts?: { optional?: boolean }): string {
  if (v == null && opts?.optional) return "";
  if (typeof v !== "string") bad(`${field} must be a string`);
  return v;
}

function parsePayload(body: unknown): IngestPayload {
  if (typeof body !== "object" || body === null) bad("body must be an object");
  const b = body as Record<string, unknown>;

  const url = str(b.url, "url");
  if (!/^https?:\/\//.test(url)) bad("url must be an http(s) URL");

  if (typeof b.startedAt !== "number" || !Number.isFinite(b.startedAt)) {
    bad("startedAt must be an epoch-ms number");
  }
  const scannedAt = new Date(b.startedAt);
  if (Number.isNaN(scannedAt.getTime())) bad("startedAt is not a valid time");

  if (!Array.isArray(b.issues)) bad("issues must be an array");
  const issues = b.issues.map((raw, i): IngestIssue => {
    if (typeof raw !== "object" || raw === null) bad(`issues[${i}] must be an object`);
    const it = raw as Record<string, unknown>;
    const impact = str(it.impact, `issues[${i}].impact`);
    if (!IMPACTS.has(impact)) bad(`issues[${i}].impact must be one of critical|serious|moderate|minor`);
    return {
      ruleId: str(it.ruleId, `issues[${i}].ruleId`) || bad(`issues[${i}].ruleId is empty`),
      impact: impact as Impact,
      category: str(it.category, `issues[${i}].category`, { optional: true }),
      wcag: Array.isArray(it.wcag) ? it.wcag.filter((w): w is string => typeof w === "string") : [],
      title: str(it.title, `issues[${i}].title`),
      description: str(it.description, `issues[${i}].description`, { optional: true }),
      helpUrl: typeof it.helpUrl === "string" ? it.helpUrl : undefined,
      selector: str(it.selector, `issues[${i}].selector`),
      html: str(it.html, `issues[${i}].html`, { optional: true }),
      failureSummary: typeof it.failureSummary === "string" ? it.failureSummary : undefined,
      domOrder: typeof it.domOrder === "number" ? it.domOrder : i,
    };
  });

  return {
    url,
    pageTitle: str(b.pageTitle, "pageTitle", { optional: true }) || url,
    scannedAt,
    durationMs: typeof b.durationMs === "number" ? Math.round(b.durationMs) : undefined,
    totalChecks: typeof b.totalChecks === "number" ? Math.round(b.totalChecks) : undefined,
    partial: b.partial === true,
    issues,
  };
}

function groupViolations(auditId: string, issues: IngestIssue[]) {
  const byRule = new Map<string, IngestIssue[]>();
  for (const issue of issues) {
    const list = byRule.get(issue.ruleId) ?? [];
    list.push(issue);
    byRule.set(issue.ruleId, list);
  }
  return [...byRule.entries()].map(([ruleId, group]) => {
    const first = group[0]!;
    const nodes: ViolationNode[] = [...group]
      .sort((a, b) => a.domOrder - b.domOrder)
      .map((issue) => ({
        target: issue.selector,
        html: issue.html,
        failureSummary: issue.failureSummary ?? "",
      }));
    const tags = [
      ...(first.category ? [first.category] : []),
      ...new Set(group.flatMap((issue) => issue.wcag)),
    ];
    return {
      id: crypto.randomUUID(),
      auditId,
      ruleId,
      impact: first.impact,
      help: first.title,
      helpUrl: first.helpUrl ?? null,
      description: first.description,
      tags,
      nodes,
    };
  });
}

export const Route = createFileRoute("/api/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await resolveUserId(request);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Body must be JSON" }, { status: 400 });
        }

        let payload: IngestPayload;
        try {
          payload = parsePayload(body);
        } catch (e) {
          if (e instanceof IngestError) {
            return Response.json({ error: e.message }, { status: 400 });
          }
          throw e;
        }

        const auditId = crypto.randomUUID();
        const inserted = await db
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
        if (inserted.length === 0) {
          return Response.json({ duplicate: true }, { status: 200 });
        }

        const violations = groupViolations(auditId, payload.issues);
        if (violations.length > 0) {
          await db.insert(violation).values(violations);
        }

        return Response.json(
          { auditId, violations: violations.length },
          { status: 201 },
        );
      },
    },
  },
});
