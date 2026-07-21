import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { manualAuditCheck, manualAuditPage, type CheckStatus } from "@/db/schema";
import { WCAG_22_BY_SC } from "@/lib/wcag-criteria";
import { auditForAuditor, json, preflight, requireAuditor } from "@/lib/manual-audit";

// PUT /api/manual/checks — upsert one cell of the coverage matrix. The side
// panel calls this on every checklist tick, keyed by (pageId, sc); setting
// not_tested reverts a cell without deleting the row (the notes survive).

const STATUSES: CheckStatus[] = ["pass", "fail", "not_applicable", "not_tested"];

export const Route = createFileRoute("/api/manual/checks")({
  server: {
    handlers: {
      OPTIONS: preflight,
      PUT: async ({ request }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);

        let body: {
          auditId?: unknown;
          pageId?: unknown;
          sc?: unknown;
          status?: unknown;
          notes?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }
        const { auditId, pageId, sc, status, notes } = body;
        if (typeof auditId !== "string" || typeof pageId !== "string") {
          return json({ error: "auditId and pageId are required" }, 400);
        }
        if (typeof sc !== "string" || !WCAG_22_BY_SC.has(sc)) {
          return json({ error: `Unknown success criterion: ${String(sc)}` }, 400);
        }
        if (!STATUSES.includes(status as CheckStatus)) {
          return json({ error: `status must be one of ${STATUSES.join(", ")}` }, 400);
        }
        if (notes != null && typeof notes !== "string") {
          return json({ error: "notes must be a string" }, 400);
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

        const [check] = await db
          .insert(manualAuditCheck)
          .values({
            id: crypto.randomUUID(),
            manualAuditId: audit.id,
            pageId,
            sc,
            status: status as CheckStatus,
            notes: notes ?? null,
          })
          .onConflictDoUpdate({
            target: [manualAuditCheck.pageId, manualAuditCheck.sc],
            set: {
              status: status as CheckStatus,
              // Only overwrite notes when the caller sent them; a bare status
              // tick must not blank an earlier note.
              ...(notes != null ? { notes } : {}),
              updatedAt: new Date(),
            },
          })
          .returning();
        return json({ check }, 200);
      },
    },
  },
});
