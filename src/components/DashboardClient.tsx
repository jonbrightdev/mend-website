import { useState, useMemo, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Pip } from "@/components/Pip";
import { TrendChart } from "@/components/TrendChart";
import {
  type AuditRecord,
  type Impact,
  IMPACT_ORDER,
  nodeCount,
  countsByImpact,
  totalViolations,
  byRule,
  aggregateTrend,
  fmtDate,
  fmtDateTime,
  relTime,
} from "@/lib/dashboard-data";

type Layout = "overview" | "sidebar";

interface Props {
  audits: AuditRecord[];
  runDates: string[];
  // False only while the account holds no non-revoked key — revoking every key
  // brings the CTA back, since the extension is disconnected again.
  hasActiveKey: boolean;
}

// --------------- Small helpers ---------------------------------------

function impactLabel(k: Impact): string {
  return k.charAt(0).toUpperCase() + k.slice(1);
}

function MiniImpacts({ audit }: { audit: AuditRecord }) {
  const c = countsByImpact([audit]);
  const label = `${c.critical} critical, ${c.serious} serious, ${c.moderate} moderate, ${c.minor} minor`;
  return (
    <span className="mini-impacts" aria-label={label}>
      {IMPACT_ORDER.map((k) => (
        <span key={k} className={c[k] > 0 ? `s-${k}` : "zero"}>
          {c[k]}
        </span>
      ))}
    </span>
  );
}

// --------------- Empty state -----------------------------------------

function EmptyState() {
  return (
    <div className="state">
      {/* Shared Pip so the dashboard matches the rest of the site (arm + clipboard). */}
      <Pip
        className="pip"
        titleId="pipEmptyT"
        descId="pipEmptyD"
        title="Pip, the Mend inspector"
        desc="The round Mend mascot with round glasses, holding a clipboard with a checklist."
      />
      <h2>No audits yet</h2>
      <p>
        Audits show up here once you connect the Mend extension to your account.
        It takes about a minute:
      </p>
      <ol className="connect-steps">
        <li>
          Generate an <strong>account key</strong> on your account page.
        </li>
        <li>
          In the extension, open <strong>Settings</strong> → “Save audits to my
          dashboard”, paste the key, and hit Save.
        </li>
        <li>
          Run an audit and click <strong>“Save to dashboard”</strong> — it lands
          here.
        </li>
      </ol>
      <div className="state__cta">
        <Link className="btn btn--primary btn--lg" to="/account">
          Get your account key
        </Link>
        <Link className="btn btn--ghost btn--lg" to="/" hash="how-it-works">
          How to run an audit
        </Link>
      </div>
    </div>
  );
}

// --------------- Main dashboard client -------------------------------

export function DashboardClient({ audits, runDates, hasActiveKey }: Props) {
  const [layout, setLayout] = useState<Layout>("overview");
  const [scope, setScope] = useState<string>("all");
  const [activeImpacts, setActiveImpacts] = useState<Set<Impact>>(new Set());
  const [search, setSearch] = useState("");

  // Persist layout preference
  useEffect(() => {
    const saved = localStorage.getItem("mend.layout");
    if (saved === "sidebar" || saved === "overview") setLayout(saved);
  }, []);

  const handleLayout = useCallback((l: Layout) => {
    setLayout(l);
    localStorage.setItem("mend.layout", l);
  }, []);

  const toggleImpact = useCallback((impact: Impact) => {
    setActiveImpacts((prev) => {
      const next = new Set(prev);
      if (next.has(impact)) next.delete(impact);
      else next.add(impact);
      return next;
    });
  }, []);

  // Audits filtered by scope only (for stats, trend, impact counts)
  const scopedAudits = useMemo(
    () => (scope === "all" ? audits : audits.filter((a) => a.url === scope)),
    [audits, scope]
  );

  const impactCounts = useMemo(() => countsByImpact(scopedAudits), [scopedAudits]);
  const scopedTotal = impactCounts.critical + impactCounts.serious + impactCounts.moderate + impactCounts.minor;

  const lastAudit = useMemo(
    () => [...scopedAudits].sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime())[0],
    [scopedAudits]
  );

  // Rules filtered by scope + active impacts
  const rules = useMemo(() => {
    const rows = byRule(scopedAudits);
    if (activeImpacts.size === 0) return rows;
    return rows.filter((r) => activeImpacts.has(r.impact));
  }, [scopedAudits, activeImpacts]);

  const trendPoints = useMemo(
    () => aggregateTrend(scopedAudits, runDates),
    [scopedAudits, runDates],
  );

  // Table rows: scope + impact + search
  const tableRows = useMemo(
    () =>
      audits.filter((a) => {
        if (scope !== "all" && a.url !== scope) return false;
        if (
          search &&
          !a.url.toLowerCase().includes(search.toLowerCase()) &&
          !a.pageTitle.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        if (activeImpacts.size > 0) {
          const c = countsByImpact([a]);
          if (!IMPACT_ORDER.some((k) => activeImpacts.has(k) && c[k] > 0)) return false;
        }
        return true;
      }),
    [audits, scope, search, activeImpacts]
  );

  // Aside rows: search only
  const asideRows = useMemo(
    () =>
      search
        ? audits.filter(
            (a) =>
              a.url.toLowerCase().includes(search.toLowerCase()) ||
              a.pageTitle.toLowerCase().includes(search.toLowerCase())
          )
        : audits,
    [audits, search]
  );

  const pct = (n: number) => (scopedTotal ? `${((n / scopedTotal) * 100).toFixed(1)}%` : "0%");

  const trendHint =
    scope === "all"
      ? `Aggregate · last ${trendPoints.length} runs`
      : `This page · last ${trendPoints.length} runs`;

  const rulesScopeHint = scope === "all" ? "across all pages" : "on this page";

  const announceText = (() => {
    const imp = activeImpacts.size
      ? [...activeImpacts].join(", ")
      : "all impact levels";
    const sc = scope === "all" ? "all pages" : scope.replace(/^https?:\/\//, "");
    return `Showing ${rules.length} rule${rules.length === 1 ? "" : "s"} at ${imp}, scoped to ${sc}.`;
  })();

  if (audits.length === 0) {
    return (
      <div className="wrap app-main app-main--enter">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="wrap app-main app-main--enter">
      {/* App head */}
      <div className="app-head">
        <div>
          <p className="eyebrow">Aggregate audit</p>
          <h1>Accessibility across your site</h1>
          <p className="app-head__meta">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Last synced {lastAudit ? relTime(lastAudit.scannedAt) : "—"} · {audits.length} page{audits.length !== 1 ? "s" : ""} · {totalViolations(audits)} open violation{totalViolations(audits) !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          <Link className="btn btn--ghost" to="/vpat">
            VPAT report
          </Link>
          {!hasActiveKey && (
            <Link className="btn btn--ghost" to="/account">
              Connect extension
            </Link>
          )}
        </div>
      </div>

      {/* Main toolbar: search + scope + layout */}
      <div className="toolbar">
        <div className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <label htmlFor="pageSearch" className="visually-hidden">
            Filter pages by URL
          </label>
          <input
            type="search"
            id="pageSearch"
            placeholder="Filter pages by URL…"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="toolbar__group">
          <label className="toolbar__label" htmlFor="scopeSelect">
            Scope
          </label>
          <select
            className="select"
            id="scopeSelect"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Scope the dashboard to one page"
          >
            <option value="all">All pages ({audits.length})</option>
            {audits.map((a) => (
              <option key={a.id} value={a.url}>
                {a.url.replace(/^https?:\/\//, "")}
              </option>
            ))}
          </select>
        </div>

        <span className="spacer" />

        <div className="toolbar__group" role="group" aria-label="Dashboard layout">
          <span className="toolbar__label" id="layoutLbl">
            Layout
          </span>
          <div className="segmented" role="group" aria-labelledby="layoutLbl">
            <button
              type="button"
              aria-pressed={layout === "overview"}
              onClick={() => handleLayout("overview")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" />
                <rect x="3" y="13" width="18" height="8" rx="1.5" stroke="currentColor" strokeWidth="2" />
              </svg>
              Overview
            </button>
            <button
              type="button"
              aria-pressed={layout === "sidebar"}
              onClick={() => handleLayout("sidebar")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="7" height="18" rx="1.5" stroke="currentColor" strokeWidth="2" />
                <rect x="13" y="3" width="8" height="18" rx="1.5" stroke="currentColor" strokeWidth="2" />
              </svg>
              By page
            </button>
          </div>
        </div>
      </div>

      {/* Impact filter chips */}
      <div className="toolbar" style={{ marginTop: "-.6rem" }}>
        <span className="toolbar__label" id="impLbl">
          Impact
        </span>
        <div className="impact-filters" role="group" aria-labelledby="impLbl">
          {IMPACT_ORDER.map((k) => (
            <button
              key={k}
              type="button"
              className="fchip"
              aria-pressed={activeImpacts.has(k)}
              onClick={() => toggleImpact(k)}
            >
              <span className={`dot dot--${k}`} />
              {impactLabel(k)}{" "}
              <span className="num">{impactCounts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active scope banner */}
      {scope !== "all" && (
        <div className="scope-bar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M7 12h14M11 18h10" stroke="#a23a1c" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>
            Scoped to <code>{scope.replace(/^https?:\/\//, "")}</code>
          </span>
          <button
            type="button"
            className="clear"
            onClick={() => setScope("all")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Show all pages
          </button>
        </div>
      )}

      {/* Live region for filter result announcements */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announceText}
      </p>

      {/* Summary stats */}
      <section aria-label="Summary statistics">
        <div className="stats">
          <div className="stat stat--total">
            <p className="stat__k">Total violations</p>
            <div className="stat__v">{scopedTotal}</div>
            <p className="stat__sub">{scope === "all" ? "across your whole site" : "on this page"}</p>
          </div>

          <div className="stat" style={{ gridColumn: "span 2", minWidth: "260px" }}>
            <p className="stat__k">By impact level</p>
            <div
              className="impact-bar"
              role="img"
              aria-label={`${impactCounts.critical} critical, ${impactCounts.serious} serious, ${impactCounts.moderate} moderate, ${impactCounts.minor} minor`}
            >
              <span className="s-critical" style={{ width: pct(impactCounts.critical) }} />
              <span className="s-serious" style={{ width: pct(impactCounts.serious) }} />
              <span className="s-moderate" style={{ width: pct(impactCounts.moderate) }} />
              <span className="s-minor" style={{ width: pct(impactCounts.minor) }} />
            </div>
            <ul className="impact-legend">
              {IMPACT_ORDER.map((k) => (
                <li key={k}>
                  <span className={`dot dot--${k}`} />
                  {impactLabel(k)} <b>{impactCounts[k]}</b>
                </li>
              ))}
            </ul>
          </div>

          <div className="stat">
            <p className="stat__k">Pages audited</p>
            <div className="stat__v">{scopedAudits.length}</div>
            <p className="stat__sub">{scope === "all" ? "distinct URLs" : "scoped view"}</p>
          </div>

          <div className="stat">
            <p className="stat__k">Last scanned</p>
            <div className="stat__v" style={{ fontSize: "1.5rem", lineHeight: 1.2 }}>
              {lastAudit ? relTime(lastAudit.scannedAt) : "—"}
            </div>
            <p className="stat__sub">{lastAudit ? fmtDateTime(lastAudit.scannedAt) : ""}</p>
          </div>
        </div>
      </section>

      {/* Trend over time */}
      <section className="panel" aria-labelledby="trend-h">
        <div className="panel__head">
          <h2 id="trend-h">Violations over time</h2>
          <span className="hint">{trendHint}</span>
        </div>
        <TrendChart pts={trendPoints} />
      </section>

      {/* Sidebar + main content grid */}
      <div className={`app-layout ${layout === "sidebar" ? "is-sidebar" : "is-table"}`}>

        {/* Pages aside (visible in sidebar layout only) */}
        <aside className="pages-aside" aria-label="Audited pages">
          <h2>Pages</h2>
          <ul className="pages-list">
            <li>
              <button
                type="button"
                className="page-pick page-pick--all"
                aria-current={scope === "all" ? "true" : undefined}
                onClick={() => setScope("all")}
              >
                <span>
                  <span className="pp-title">All pages</span>
                  <span className="pp-url">
                    {totalViolations(audits)} violations · {audits.length} URLs
                  </span>
                </span>
                <span className="count-pill">{totalViolations(audits)}</span>
              </button>
            </li>
            {asideRows.map((a) => {
              const count = nodeCount(a);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className="page-pick"
                    aria-current={scope === a.url ? "true" : undefined}
                    onClick={() => setScope(a.url)}
                  >
                    <span>
                      <span className="pp-title">{a.pageTitle}</span>
                      <span className="pp-url">{a.url.replace(/^https?:\/\//, "")}</span>
                    </span>
                    <span className={`count-pill${count ? " count-pill--has" : ""}`}>{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div>
          {/* Rule breakdown */}
          <section className="panel" aria-labelledby="rules-h">
            <div className="panel__head">
              <h2 id="rules-h">Top issues by rule</h2>
              <span className="hint">{rulesScopeHint}</span>
            </div>
            <ul className="rule-list">
              {rules.length > 0 ? (
                rules.map((r) => (
                  <li key={r.ruleId} className="rule-row">
                    <span className={`sev sev--${r.impact}`}>
                      <span className={`dot dot--${r.impact}`} />
                      {impactLabel(r.impact)}
                    </span>
                    <div className="rule-row__main">
                      <Link
                        className="rule-id"
                        to="/audits/$auditId/$ruleId"
                        params={{ auditId: r.auditId, ruleId: r.ruleId }}
                      >
                        {r.ruleId}
                      </Link>
                      <p className="rule-row__help">{r.help}</p>
                    </div>
                    <div className="rule-row__count">
                      {r.count}
                      <small>
                        {r.pageCount} {r.pageCount === 1 ? "page" : "pages"}
                      </small>
                    </div>
                  </li>
                ))
              ) : (
                <li className="rule-row">
                  <div className="rule-row__main">
                    <p className="rule-row__help">No issues match this filter.</p>
                  </div>
                </li>
              )}
            </ul>
          </section>

          {/* Pages table (shown in overview layout; hidden in sidebar layout via CSS) */}
          <section className="panel" id="pagesPanel" aria-labelledby="pages-h">
            <div className="panel__head">
              <h2 id="pages-h">Audited pages</h2>
              <span className="hint">
                {tableRows.length} {tableRows.length === 1 ? "page" : "pages"}
              </span>
            </div>
            <div className="panel__body--flush table-scroll">
              <table className="data">
                <caption className="visually-hidden">
                  Pages audited, with violation counts by impact. Select a page to scope the dashboard, or open its details.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Page</th>
                    <th scope="col">Total</th>
                    <th scope="col">By impact (C / S / Mo / Mi)</th>
                    <th scope="col">Last scanned</th>
                    <th scope="col">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length > 0 ? (
                    tableRows.map((a) => {
                      const count = nodeCount(a);
                      return (
                        <tr key={a.id}>
                          <td>
                            <div className="cell-page">
                              <Link to="/audits/$auditId" params={{ auditId: a.id }}>
                                {a.pageTitle}
                              </Link>
                              <span className="url">{a.url}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`count-pill${count ? " count-pill--has" : ""}`}>
                              {count}
                            </span>
                          </td>
                          <td>
                            <MiniImpacts audit={a} />
                          </td>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>
                            {fmtDate(a.scannedAt)}
                            <br />
                            <span style={{ color: "var(--muted)", fontSize: ".82rem" }}>
                              {relTime(a.scannedAt)}
                            </span>
                          </td>
                          <td>
                            <Link
                              className="row-link"
                              to="/audits/$auditId"
                              params={{ auditId: a.id }}
                            >
                              Details{" "}
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "2rem" }}>
                        No pages match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
