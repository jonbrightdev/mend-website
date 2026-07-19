import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DetailsChipPanel } from "@/components/DetailsChipPanel";
import { TrendChart } from "@/components/TrendChart";
import {
  ruleSpecFor,
  wcagUnderstandingUrl,
  fmtDate,
  fmtDateTime,
} from "@/lib/dashboard-data";
import { fetchAudit } from "@/lib/dashboard-fns";

export const Route = createFileRoute("/audits/$auditId/$ruleId")({
  loader: async ({ params }) => {
    const { user, audit, trend } = await fetchAudit({ data: params.auditId });
    if (!audit) throw redirect({ to: "/dashboard" });

    const violation = audit.violations.find((v) => v.id === params.ruleId);
    if (!violation) {
      throw redirect({
        to: "/audits/$auditId",
        params: { auditId: params.auditId },
      });
    }

    // Hand-written catalogue entry when we have one, otherwise a spec
    // assembled from the ingested violation itself.
    const rule = ruleSpecFor(violation);

    return { user, audit, trend, violation, rule };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          {
            title: `${loaderData.violation.id} — ${loaderData.audit.pageTitle} — Mend`,
          },
          {
            name: "description",
            content: `Remediation detail for ${loaderData.violation.id} on ${loaderData.audit.url}.`,
          },
        ]
      : [{ title: "Issue details — Mend" }],
  }),
  pendingComponent: DetailsPending,
  component: DetailsPage,
});

function impactLabel(impact: string): string {
  return impact.charAt(0).toUpperCase() + impact.slice(1);
}

function DetailsPage() {
  const { auditId, ruleId } = Route.useParams();
  const { user, audit, trend, violation, rule } = Route.useLoaderData();

  const pageHost = audit.url.replace(/^https?:\/\//, "");
  const nodeCount = violation.nodes.length;
  const nodeLabel = `${nodeCount} ${nodeCount === 1 ? "element" : "elements"}`;

  const chips = audit.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodeCount: v.nodes.length,
  }));

  const failureBody = (raw: string) =>
    raw.replace(/^Fix any of the following:\s*/, "").trim();

  return (
    <MarketingShell
      current="dashboard"
      account={{ name: user.name, email: user.email }}
    >
      <div className="wrap app-main">
        {/* Breadcrumb */}
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li>
              <Link to="/dashboard">Dashboard</Link>
            </li>
            <li>
              <Link to="/audits/$auditId" params={{ auditId }}>
                {pageHost}
              </Link>
            </li>
            <li>
              <span aria-current="page">{ruleId}</span>
            </li>
          </ol>
        </nav>

        {/* Page context panel */}
        <section
          className="panel"
          aria-labelledby="page-h"
          style={{ marginBottom: "1.6rem" }}
        >
          <div className="panel__head">
            <div>
              <h2 id="page-h" style={{ fontSize: "1.05rem" }}>
                {audit.pageTitle}
              </h2>
              <p
                className="hint"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {audit.url}
              </p>
            </div>
            <span className="hint">Scanned {fmtDateTime(audit.scannedAt)}</span>
          </div>
          <div className="panel__body">
            <p
              style={{
                margin: "0 0 .7rem",
                fontSize: ".9rem",
                color: "var(--muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".03em",
              }}
            >
              Issues on this page — select one
            </p>
            <DetailsChipPanel
              chips={chips}
              activeRuleId={ruleId}
              auditId={auditId}
            />
          </div>
        </section>

        {/* Per-page trend — only once there is more than one run day */}
        {trend.length >= 2 && (
          <section className="panel" aria-labelledby="page-trend-h">
            <div className="panel__head">
              <h2 id="page-trend-h">This page over time</h2>
              <span className="hint">{trend.length} run days</span>
            </div>
            <TrendChart pts={trend} />
          </section>
        )}

        {/* Violation header */}
        <div className="det-head">
          <span className={`sev sev--${violation.impact}`}>
            <span className="dot" aria-hidden="true" />
            {impactLabel(violation.impact)}
          </span>
          <span className="det-rule">{ruleId}</span>
        </div>
        <h1 className="det-title" tabIndex={-1} id="det-title">
          {violation.help}
        </h1>
        <p className="det-desc">{violation.description}</p>

        <div className="det-grid">
          {/* LEFT: fix + evidence */}
          <div>
            {/* Fix card */}
            <div className="fix-card">
              <h2>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 12.5 10 17.5 19 7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                How to fix it
              </h2>
              <p>{rule.fix}</p>
              {rule.before && rule.after && (
                <div
                  className="codeflip codeflip--lg"
                  aria-label="Before and after code example"
                >
                  <div className="codeflip__row codeflip__row--before">
                    <span className="codeflip__tag">Before</span>
                    <code>{rule.before}</code>
                  </div>
                  <div className="codeflip__row codeflip__row--after">
                    <span className="codeflip__tag">After</span>
                    <code>{rule.after}</code>
                  </div>
                </div>
              )}
            </div>

            {/* Evidence panel */}
            <section className="panel" aria-labelledby="evidence-h">
              <div className="panel__head">
                <h2 id="evidence-h">Affected elements</h2>
                <span className="hint">{nodeLabel}</span>
              </div>
              <div className="panel__body">
                <div className="nodes">
                  {violation.nodes.map((node, i) => (
                    <div key={i} className="node-card">
                      <div className="node-card__head">
                        <span className="n">#{i + 1}</span>
                        <code className="target">{node.target}</code>
                      </div>
                      <pre className="snippet">
                        <code>{node.html}</code>
                      </pre>
                      <p className="failure">
                        <b>Fix any of the following:</b>
                        {"\n"}
                        {failureBody(node.failureSummary)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT: meta + wcag + docs */}
          <aside aria-label="Rule reference">
            <div className="meta-card">
              <h2>About this issue</h2>
              <dl>
                <div className="meta-row">
                  <dt>Impact</dt>
                  <dd>
                    <span className={`sev sev--${violation.impact}`}>
                      <span className="dot" aria-hidden="true" />
                      {impactLabel(violation.impact)}
                    </span>
                  </dd>
                </div>
                <div className="meta-row">
                  <dt>Occurrences</dt>
                  <dd>{nodeLabel}</dd>
                </div>
                <div className="meta-row">
                  <dt>Page</dt>
                  <dd style={{ maxWidth: "11rem", wordBreak: "break-all" }}>
                    {pageHost}
                  </dd>
                </div>
                <div className="meta-row">
                  <dt>Scanned</dt>
                  <dd>{fmtDate(audit.scannedAt)}</dd>
                </div>
              </dl>
            </div>

            <div className="meta-card">
              <h2>WCAG success criteria</h2>
              <ul className="wcag-list">
                {rule.wcag.length === 0 && (
                  <li style={{ color: "var(--muted)", fontSize: ".9rem" }}>
                    Not mapped to a specific criterion.
                  </li>
                )}
                {rule.wcag.map((criterion) => {
                  // Link the criterion to its official W3C Understanding page;
                  // the Deque how-to lives in its own button below.
                  const specUrl = wcagUnderstandingUrl(criterion);
                  return specUrl ? (
                    <li key={criterion}>
                      <a
                        href={specUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {criterion}
                      </a>
                    </li>
                  ) : (
                    <li key={criterion}>{criterion}</li>
                  );
                })}
              </ul>
              <p
                style={{
                  fontSize: ".85rem",
                  color: "var(--muted)",
                  margin: ".9rem 0 .3rem",
                  textTransform: "uppercase",
                  letterSpacing: ".03em",
                  fontWeight: 600,
                }}
              >
                axe tags
              </p>
              <div className="tag-row">
                {violation.tags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {rule.helpUrl && (
              <a
                className="btn btn--ghost btn--block"
                href={rule.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the full rule on Deque
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            )}
          </aside>
        </div>

        <p style={{ marginTop: "1.8rem" }}>
          <Link className="row-link" to="/dashboard">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M19 12H5M11 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to dashboard
          </Link>
        </p>
      </div>
    </MarketingShell>
  );
}

function DetailsPending() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SiteHeader current="dashboard" />
      <main id="main">
        <div className="wrap app-main">
          <div className="loading-note">
            <span className="spinner" aria-hidden="true" />
            Loading issue…
          </div>
          <div className="sk sk-row" style={{ height: 90, marginBottom: "1.4rem" }} />
          <div className="det-grid">
            <div>
              <div
                className="sk"
                style={{ height: 200, borderRadius: "var(--r-lg)", marginBottom: "1.4rem" }}
              />
              <div className="sk sk-row" style={{ marginBottom: ".7rem" }} />
              <div className="sk sk-row" />
            </div>
            <div>
              <div className="sk" style={{ height: 260, borderRadius: "var(--r-lg)" }} />
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
