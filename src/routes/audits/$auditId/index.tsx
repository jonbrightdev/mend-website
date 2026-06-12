import { createFileRoute, redirect } from "@tanstack/react-router";
import { defaultRuleId } from "@/lib/dashboard-data";
import { fetchAudit } from "@/lib/dashboard-fns";

// /audits/:auditId lands on the page's highest-impact, most-occurring rule.
export const Route = createFileRoute("/audits/$auditId/")({
  loader: async ({ params }) => {
    const { audit } = await fetchAudit({ data: params.auditId });
    const ruleId = audit ? defaultRuleId(audit) : undefined;
    if (!audit || !ruleId) throw redirect({ to: "/dashboard" });
    throw redirect({
      to: "/audits/$auditId/$ruleId",
      params: { auditId: params.auditId, ruleId },
      replace: true,
    });
  },
});
