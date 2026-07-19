import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { defaultRuleId, fmtDateTime } from "@/lib/dashboard-data";
import { fetchAudit } from "@/lib/dashboard-fns";

// /audits/:auditId lands on the page's highest-impact, most-occurring rule.
// Pages with zero violations have no rule to land on, so they render an
// empty state here instead.
export const Route = createFileRoute("/audits/$auditId/")({
  loader: async ({ params }) => {
    const { user, audit } = await fetchAudit({ data: params.auditId });
    if (!audit) throw redirect({ to: "/dashboard" });

    const ruleId = defaultRuleId(audit);
    if (ruleId) {
      throw redirect({
        to: "/audits/$auditId/$ruleId",
        params: { auditId: params.auditId, ruleId },
        replace: true,
      });
    }

    return { user, audit };
  },
  component: CleanPage,
});

function CleanPage() {
  const { user, audit } = Route.useLoaderData();
  const pageHost = audit.url.replace(/^https?:\/\//, "");

  return (
    <MarketingShell
      current="dashboard"
      account={{ name: user.name, email: user.email }}
    >
      <div className="wrap app-main">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link to="/dashboard">Dashboard</Link>
            </li>
            <li>
              <span aria-current="page">{pageHost}</span>
            </li>
          </ol>
        </nav>

        <section className="panel" aria-labelledby="page-h">
          <div className="panel__head">
            <div>
              <h2 id="page-h" style={{ fontSize: "1.05rem" }}>
                {audit.pageTitle}
              </h2>
              <p className="hint" style={{ fontFamily: "var(--font-mono)" }}>
                {audit.url}
              </p>
            </div>
            <span className="hint">Scanned {fmtDateTime(audit.scannedAt)}</span>
          </div>
          <div className="panel__body">
            <p>No automated WCAG issues found on this page.</p>
          </div>
        </section>

        <p style={{ marginTop: "1.8rem" }}>
          <Link className="row-link" to="/dashboard">
            Back to dashboard
          </Link>
        </p>
      </div>
    </MarketingShell>
  );
}
