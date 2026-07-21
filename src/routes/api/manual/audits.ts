import { createFileRoute } from "@tanstack/react-router";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { manualAudit, user } from "@/db/schema";
import { json, preflight, requireAuditor } from "@/lib/manual-audit";

// GET  /api/manual/audits — the acting auditor's audits, newest first.
// POST /api/manual/audits — create one. The customer is named by email (the
// auditor knows who bought the audit); we resolve it to userId here so the
// extension never handles internal ids it didn't get from us.

export const Route = createFileRoute("/api/manual/audits")({
  server: {
    handlers: {
      OPTIONS: preflight,
      GET: async ({ request }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);

        const audits = await db
          .select()
          .from(manualAudit)
          .where(eq(manualAudit.auditorUserId, who.userId))
          .orderBy(desc(manualAudit.createdAt));
        return json({ audits }, 200);
      },
      POST: async ({ request }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);

        let body: {
          customerEmail?: unknown;
          name?: unknown;
          scopeUrl?: unknown;
          conformanceTarget?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }

        const { customerEmail, name, scopeUrl, conformanceTarget } = body;
        if (typeof customerEmail !== "string" || !customerEmail.includes("@")) {
          return json({ error: "customerEmail is required" }, 400);
        }
        if (typeof name !== "string" || !name.trim()) {
          return json({ error: "name is required" }, 400);
        }
        if (typeof scopeUrl !== "string" || !/^https?:\/\//.test(scopeUrl)) {
          return json({ error: "scopeUrl must be an http(s) URL" }, 400);
        }
        const target = conformanceTarget ?? "AA";
        if (target !== "A" && target !== "AA") {
          return json({ error: "conformanceTarget must be A or AA" }, 400);
        }

        const [customer] = await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, customerEmail.toLowerCase().trim()))
          .limit(1);
        if (!customer) {
          return json({ error: "No account with that email" }, 404);
        }

        const [created] = await db
          .insert(manualAudit)
          .values({
            id: crypto.randomUUID(),
            userId: customer.id,
            auditorUserId: who.userId,
            name: name.trim(),
            scopeUrl,
            conformanceTarget: target,
          })
          .returning();
        return json({ audit: created }, 201);
      },
    },
  },
});
