/* ============================================================
   Server functions for the portal pages: session check + data
   fetch in one round trip. Loaders call these; the database
   queries themselves live in dashboard-queries.ts.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { currentSessionUser } from "@/lib/session";
import { getDashboardData, getAuditRecord } from "@/lib/dashboard-queries";

export const fetchDashboard = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    const { audits, runDates } = await getDashboardData(user.id);
    return { user, audits, runDates };
  },
);

export const fetchAudit = createServerFn({ method: "GET" })
  .validator((auditId: string) => {
    if (typeof auditId !== "string" || auditId.length === 0) {
      throw new Error("auditId is required");
    }
    return auditId;
  })
  .handler(async ({ data: auditId }) => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    const audit = await getAuditRecord(user.id, auditId);
    return { user, audit: audit ?? null };
  });
