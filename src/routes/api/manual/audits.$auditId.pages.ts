import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/db";
import { manualAuditPage } from "@/db/schema";
import { auditForAuditor, json, preflight, requireAuditor } from "@/lib/manual-audit";

// POST /api/manual/audits/$auditId/pages — add a page (or a distinct state of
// one) to the WCAG-EM sample. Checks are NOT seeded here: the coverage matrix
// is sparse and rows appear as the auditor works (see schema.ts).

export const Route = createFileRoute("/api/manual/audits/$auditId/pages")({
  server: {
    handlers: {
      OPTIONS: preflight,
      POST: async ({ request, params }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);
        const audit = await auditForAuditor(params.auditId, who.userId);
        if (!audit) return json({ error: "Not found" }, 404);

        let body: { url?: unknown; title?: unknown; stateDescription?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }
        const { url, title, stateDescription } = body;
        if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
          return json({ error: "url must be an http(s) URL" }, 400);
        }
        if (typeof title !== "string" || !title.trim()) {
          return json({ error: "title is required" }, 400);
        }
        if (stateDescription != null && typeof stateDescription !== "string") {
          return json({ error: "stateDescription must be a string" }, 400);
        }

        const [page] = await db
          .insert(manualAuditPage)
          .values({
            id: crypto.randomUUID(),
            manualAuditId: audit.id,
            url,
            title: title.trim(),
            stateDescription: stateDescription?.trim() || null,
          })
          .returning();
        return json({ page }, 201);
      },
    },
  },
});
