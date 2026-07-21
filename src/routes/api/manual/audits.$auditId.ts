import { createFileRoute } from "@tanstack/react-router";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  manualAudit,
  manualAuditCheck,
  manualAuditPage,
  manualDismissal,
  manualFinding,
  type ManualAuditStatus,
} from "@/db/schema";
import { auditForAuditor, json, preflight, requireAuditor } from "@/lib/manual-audit";

// GET   /api/manual/audits/$auditId — the full audit state (pages, checks,
//       findings, dismissals) in one payload; the side panel hydrates from
//       this on open and after reconnects, so the extension holds no state
//       the server doesn't.
// PATCH /api/manual/audits/$auditId — status transitions. "published" is the
//       customer-visible switch and stamps publishedAt.

const STATUSES: ManualAuditStatus[] = ["in_progress", "complete", "published"];

export const Route = createFileRoute("/api/manual/audits/$auditId")({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request, params }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);
        const audit = await auditForAuditor(params.auditId, who.userId);
        if (!audit) return json({ error: "Not found" }, 404);

        const [pages, checks, findings, dismissals] = await Promise.all([
          db
            .select()
            .from(manualAuditPage)
            .where(eq(manualAuditPage.manualAuditId, audit.id))
            .orderBy(asc(manualAuditPage.sortOrder), asc(manualAuditPage.createdAt)),
          db.select().from(manualAuditCheck).where(eq(manualAuditCheck.manualAuditId, audit.id)),
          db.select().from(manualFinding).where(eq(manualFinding.manualAuditId, audit.id)),
          db.select().from(manualDismissal).where(eq(manualDismissal.manualAuditId, audit.id)),
        ]);
        return json({ audit, pages, checks, findings, dismissals }, 200);
      },
      PATCH: async ({ request, params }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);
        const audit = await auditForAuditor(params.auditId, who.userId);
        if (!audit) return json({ error: "Not found" }, 404);

        let body: { status?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }
        const status = body.status as ManualAuditStatus;
        if (!STATUSES.includes(status)) {
          return json({ error: `status must be one of ${STATUSES.join(", ")}` }, 400);
        }

        const [updated] = await db
          .update(manualAudit)
          .set({
            status,
            updatedAt: new Date(),
            publishedAt: status === "published" ? (audit.publishedAt ?? new Date()) : audit.publishedAt,
          })
          .where(eq(manualAudit.id, audit.id))
          .returning();
        return json({ audit: updated }, 200);
      },
    },
  },
});
