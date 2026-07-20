import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { VpatReportData, VpatRow } from "@/lib/vpat-data";
import { fmtDate } from "@/lib/dashboard-data";

// The /vpat page: name the product, preview the determinations, download the
// standalone HTML report. The preview renders from the same VpatRow data the
// downloaded file uses, in the site's own styling — it deliberately does not
// iframe the report, which is a self-contained document meant for a buyer.
export function VpatClient({ report }: { report: VpatReportData | null }) {
  // The server's fallback (the audited hostnames) is the starting value, so an
  // untouched form downloads exactly what the preview describes.
  const [name, setName] = useState(report?.productName ?? "");

  if (!report) return <EmptyState />;

  const trimmed = name.trim();
  const downloadHref = `/api/vpat${trimmed ? `?name=${encodeURIComponent(trimmed)}` : ""}`;
  const counts = {
    supports: report.rows.filter((r) => r.conformance === "Supports").length,
    partial: report.rows.filter((r) => r.conformance === "Partially Supports").length,
    fails: report.rows.filter((r) => r.conformance === "Does Not Support").length,
  };

  return (
    <div className="wrap app-main app-main--enter">
      <div className="app-head">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Accessibility conformance report</h1>
          <p className="app-head__meta">
            A VPAT® 2.5-format report built from the most recent scan of each of
            your {report.pages.length} audited{" "}
            {report.pages.length === 1 ? "page" : "pages"}.
          </p>
        </div>
        <a className="btn btn--primary" href={downloadHref} download>
          Download report
        </a>
      </div>

      {/* The caveat leads. A reader who takes nothing else from this page must
          still leave knowing what an automated scan can and cannot establish. */}
      <section className="panel" aria-labelledby="vpat-basis-h">
        <div className="panel__head">
          <h2 id="vpat-basis-h">What this report is</h2>
        </div>
        <div className="panel__body">
          <p style={{ maxWidth: "70ch" }}>
            This is an <strong>automated assessment</strong>. Mend scans your
            pages with axe-core and maps what it finds onto WCAG 2.2 Level A and
            AA success criteria. Automated testing reliably catches a subset of
            failures and cannot judge meaning, context, or how a page behaves
            with assistive technology.
          </p>
          <p className="muted" style={{ maxWidth: "70ch" }}>
            A criterion marked “Supports” means the automated checks found no
            failures — not that the criterion is fully met. A complete
            conformance claim needs manual evaluation by a qualified assessor.
            The downloaded report says all of this on its face, so it can be
            handed to a buyer as-is.
          </p>
        </div>
      </section>

      <section className="panel" aria-labelledby="vpat-name-h" style={{ marginTop: "1.4rem" }}>
        <div className="panel__head">
          <h2 id="vpat-name-h">Name the product</h2>
        </div>
        <div className="panel__body">
          <div className="field" style={{ maxWidth: "34rem" }}>
            <label htmlFor="vpat-name">Product or site name</label>
            <input
              id="vpat-name"
              className="input"
              type="text"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <p className="muted" style={{ margin: 0 }}>
            This is the title on the report. It defaults to the sites you audit.
          </p>
        </div>
      </section>

      <section className="panel" aria-labelledby="vpat-pages-h" style={{ marginTop: "1.4rem" }}>
        <div className="panel__head">
          <h2 id="vpat-pages-h">Pages evaluated</h2>
          <span className="hint">
            {report.pages.length} {report.pages.length === 1 ? "page" : "pages"}
          </span>
        </div>
        <div className="panel__body--flush table-scroll">
          <table className="data">
            <caption className="visually-hidden">
              The most recent scan of each page this report covers.
            </caption>
            <thead>
              <tr>
                <th scope="col">Page</th>
                <th scope="col">Last scanned</th>
              </tr>
            </thead>
            <tbody>
              {report.pages.map((p) => (
                <tr key={p.url}>
                  <td>
                    <span className="url">{p.url}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(p.scannedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CriteriaTable
        level="A"
        rows={report.rows}
        summary={counts}
        style={{ marginTop: "1.4rem" }}
      />
      <CriteriaTable level="AA" rows={report.rows} style={{ marginTop: "1.4rem" }} />

      {report.unmapped.length > 0 && (
        <section className="panel" aria-labelledby="vpat-unmapped-h" style={{ marginTop: "1.4rem" }}>
          <div className="panel__head">
            <h2 id="vpat-unmapped-h">Other findings</h2>
          </div>
          <div className="panel__body">
            <p className="muted" style={{ maxWidth: "70ch" }}>
              These findings carry no Level A or AA criterion — best-practice
              checks, Level AAA criteria, or criteria removed from WCAG 2.2.
              They appear in the report&apos;s appendix and affect no
              determination.
            </p>
            <ul>
              {report.unmapped.map((f) => (
                <li key={f.ruleId}>
                  <strong>{f.ruleId}</strong> — {f.help} ({f.nodeCount}{" "}
                  {f.nodeCount === 1 ? "instance" : "instances"})
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function CriteriaTable({
  level,
  rows,
  summary,
  style,
}: {
  level: "A" | "AA";
  rows: VpatRow[];
  summary?: { supports: number; partial: number; fails: number };
  style?: React.CSSProperties;
}) {
  const forLevel = rows.filter((r) => r.criterion.level === level);
  return (
    <section className="panel" aria-labelledby={`vpat-${level}-h`} style={style}>
      <div className="panel__head">
        <h2 id={`vpat-${level}-h`}>Level {level} success criteria</h2>
        {summary && (
          <span className="hint">
            {summary.fails} not supported · {summary.partial} partial ·{" "}
            {summary.supports} no issues found
          </span>
        )}
      </div>
      <div className="panel__body--flush table-scroll">
        <table className="data">
          <caption className="visually-hidden">
            Every WCAG 2.2 Level {level} success criterion, with the
            determination automated scanning produced and the findings behind
            it.
          </caption>
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col">Conformance</th>
              <th scope="col">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {forLevel.map((row) => (
              <tr key={row.criterion.sc}>
                <th scope="row" style={{ fontWeight: 600, textAlign: "left" }}>
                  {row.criterion.sc} {row.criterion.name}
                </th>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Conformance value={row.conformance} />
                </td>
                <td>
                  {row.findings.length === 0 ? (
                    <span className="muted">No issues detected by automated checks.</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                      {row.findings.map((f) => (
                        <li key={f.ruleId}>
                          <strong>{f.ruleId}</strong> — {f.help} ({f.nodeCount}{" "}
                          {f.nodeCount === 1 ? "instance" : "instances"} across{" "}
                          {f.pageCount} {f.pageCount === 1 ? "page" : "pages"})
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Conformance({ value }: { value: VpatRow["conformance"] }) {
  if (value === "Does Not Support") {
    return <span style={{ color: "var(--sev-critical)", fontWeight: 600 }}>{value}</span>;
  }
  if (value === "Partially Supports") {
    return <span style={{ color: "var(--sev-serious)", fontWeight: 600 }}>{value}</span>;
  }
  return <span>{value}</span>;
}

function EmptyState() {
  return (
    <div className="wrap app-main app-main--enter">
      <div className="app-head">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Accessibility conformance report</h1>
        </div>
      </div>
      <section className="panel">
        <div className="panel__body">
          <p style={{ maxWidth: "60ch" }}>
            A conformance report is built from your audit data, so there needs
            to be at least one scanned page before Mend can generate one.
          </p>
          <p className="muted" style={{ maxWidth: "60ch" }}>
            Scan a page with the browser extension, or add a page on{" "}
            <Link to="/monitors">Monitors</Link> and Mend will audit it for you
            once a day.
          </p>
        </div>
      </section>
    </div>
  );
}
