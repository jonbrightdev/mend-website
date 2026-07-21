import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  manualAuditCheck,
  manualAuditPage,
  manualFinding,
  type FindingProvenance,
} from "@/db/schema";
import type { Impact } from "@/lib/dashboard-data";
import { WCAG_22_BY_SC } from "@/lib/wcag-criteria";
import {
  auditForAuditor,
  json,
  MAX_SCREENSHOT_BASE64,
  preflight,
  requireAuditor,
  saveScreenshot,
} from "@/lib/manual-audit";

// POST /api/manual/findings — log a violation. Creating a finding also marks
// the (page, criterion) cell of the coverage matrix "fail": a finding IS the
// evidence for that fail, and keeping the two in one request means the matrix
// can never disagree with the findings list.

const SEVERITIES: Impact[] = ["critical", "serious", "moderate", "minor"];
const PROVENANCES: FindingProvenance[] = ["manual", "automated_confirmed"];

export const Route = createFileRoute("/api/manual/findings")({
  server: {
    handlers: {
      OPTIONS: preflight,
      POST: async ({ request }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);

        const text = await request.text();
        if (text.length > MAX_SCREENSHOT_BASE64 + 100_000) {
          return json({ error: "Payload too large" }, 413);
        }
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(text);
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }

        const { auditId, pageId, sc, severity, summary, provenance } = body;
        if (typeof auditId !== "string" || typeof pageId !== "string") {
          return json({ error: "auditId and pageId are required" }, 400);
        }
        if (typeof sc !== "string" || !WCAG_22_BY_SC.has(sc)) {
          return json({ error: `Unknown success criterion: ${String(sc)}` }, 400);
        }
        if (!SEVERITIES.includes(severity as Impact)) {
          return json({ error: `severity must be one of ${SEVERITIES.join(", ")}` }, 400);
        }
        if (typeof summary !== "string" || !summary.trim()) {
          return json({ error: "summary is required" }, 400);
        }
        if (!PROVENANCES.includes(provenance as FindingProvenance)) {
          return json({ error: `provenance must be one of ${PROVENANCES.join(", ")}` }, 400);
        }
        const optional = (key: string, max = 10_000): string | null => {
          const v = body[key];
          return typeof v === "string" && v.trim() ? v.slice(0, max) : null;
        };

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

        let screenshotKey: string | null = null;
        const screenshot = body.screenshotBase64;
        if (typeof screenshot === "string" && screenshot.length > 0) {
          if (screenshot.length > MAX_SCREENSHOT_BASE64) {
            return json({ error: "Screenshot too large" }, 413);
          }
          screenshotKey = await saveScreenshot(screenshot);
        }

        const [finding] = await db
          .insert(manualFinding)
          .values({
            id: crypto.randomUUID(),
            manualAuditId: audit.id,
            pageId,
            sc,
            severity: severity as Impact,
            summary: summary.trim(),
            description: optional("description"),
            remediation: optional("remediation"),
            selector: optional("selector", 1_000),
            html: optional("html", 2_000),
            screenshotKey,
            provenance: provenance as FindingProvenance,
            axeRuleId: optional("axeRuleId", 200),
          })
          .returning();

        const [check] = await db
          .insert(manualAuditCheck)
          .values({
            id: crypto.randomUUID(),
            manualAuditId: audit.id,
            pageId,
            sc,
            status: "fail",
          })
          .onConflictDoUpdate({
            target: [manualAuditCheck.pageId, manualAuditCheck.sc],
            set: { status: "fail", updatedAt: new Date() },
          })
          .returning();

        return json({ finding, check }, 201);
      },
    },
  },
});
