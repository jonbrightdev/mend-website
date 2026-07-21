import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { manualAuditPage, manualDismissal } from "@/db/schema";
import { auditForAuditor, json, preflight, requireAuditor } from "@/lib/manual-audit";

// POST /api/manual/dismissals — record why an axe candidate was rejected.
// A required reason keeps the audit defensible: every automated flag is either
// a confirmed finding or a documented dismissal, never silently dropped.

export const Route = createFileRoute("/api/manual/dismissals")({
  server: {
    handlers: {
      OPTIONS: preflight,
      POST: async ({ request }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);

        let body: {
          auditId?: unknown;
          pageId?: unknown;
          axeRuleId?: unknown;
          selector?: unknown;
          reason?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }
        const { auditId, pageId, axeRuleId, selector, reason } = body;
        if (typeof auditId !== "string" || typeof pageId !== "string") {
          return json({ error: "auditId and pageId are required" }, 400);
        }
        if (typeof axeRuleId !== "string" || !axeRuleId.trim()) {
          return json({ error: "axeRuleId is required" }, 400);
        }
        if (typeof reason !== "string" || !reason.trim()) {
          return json({ error: "reason is required" }, 400);
        }
        if (selector != null && typeof selector !== "string") {
          return json({ error: "selector must be a string" }, 400);
        }

        const audit = await auditForAuditor(auditId, who.userId);
        if (!audit) return json({ error: "Not found" }, 404);
        const [page] = await db
          .select({ id: manualAuditPage.id })
          .from(manualAuditPage)
          .where(
            and(eq(manualAuditPage.id, pageId), eq(manualAuditPage.manualAuditId, audit.id)),
          )
          .limit(1);
        if (!page) return json({ error: "Page not in this audit" }, 404);

        const [dismissal] = await db
          .insert(manualDismissal)
          .values({
            id: crypto.randomUUID(),
            manualAuditId: audit.id,
            pageId,
            axeRuleId: axeRuleId.trim(),
            selector: selector?.slice(0, 1_000) ?? null,
            reason: reason.trim(),
          })
          .returning();
        return json({ dismissal }, 201);
      },
    },
  },
});
