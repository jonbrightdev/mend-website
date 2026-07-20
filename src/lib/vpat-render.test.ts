import { describe, expect, it } from "vitest";
import { WCAG_22_CRITERIA } from "@/lib/wcag-criteria";
import type { VpatReportData, VpatRow } from "@/lib/vpat-data";
import {
  esc,
  METHODOLOGY_COPY,
  REPORT_SUBTITLE,
  renderVpatHtml,
  TRADEMARK_FOOTNOTE,
} from "@/lib/vpat-render";

function baseRows(): VpatRow[] {
  return WCAG_22_CRITERIA.map((criterion) => ({
    criterion,
    conformance: "Supports" as const,
    findings: [],
  }));
}

function data(overrides: Partial<VpatReportData> = {}): VpatReportData {
  return {
    productName: "Acme Store",
    contactEmail: "a11y@acme.test",
    generatedAt: "2026-07-20T09:00:00.000Z",
    pages: [
      { url: "https://acme.test/", pageTitle: "Home", scannedAt: "2026-07-19T08:00:00.000Z" },
    ],
    rows: baseRows(),
    unmapped: [],
    ...overrides,
  };
}

describe("esc", () => {
  it("escapes every character that could break out of markup", () => {
    expect(esc(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("renderVpatHtml", () => {
  it("renders one complete HTML document", () => {
    const html = renderVpatHtml(data());

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Acme Store — Accessibility Conformance Report</title>");
    expect(html).toContain(REPORT_SUBTITLE);
  });

  it("carries the methodology and limitations copy verbatim", () => {
    const html = renderVpatHtml(data());

    for (const paragraph of METHODOLOGY_COPY) {
      expect(html).toContain(paragraph);
    }
    expect(html).toContain(TRADEMARK_FOOTNOTE);
    // The caveat must not be relegated to a footnote.
    expect(html).toContain("Evaluation methods and limitations");
  });

  it("renders a Level A table and a Level AA table with every criterion", () => {
    const html = renderVpatHtml(data());

    expect(html).toContain("Table 1: Success Criteria, Level A");
    expect(html).toContain("Table 2: Success Criteria, Level AA");
    for (const c of WCAG_22_CRITERIA) {
      expect(html).toContain(`${c.sc} ${c.name}`);
    }
    // One row per criterion, plus the metadata and pages tables' own rows.
    expect(html.match(/<th scope="row">/g)).toHaveLength(WCAG_22_CRITERIA.length + 5);
  });

  it("escapes user- and scanner-supplied text everywhere it appears", () => {
    const rows = baseRows();
    rows[0] = {
      criterion: rows[0]!.criterion,
      conformance: "Does Not Support",
      findings: [
        {
          ruleId: "image-alt",
          help: "<script>alert(1)</script>",
          impact: "critical",
          pageCount: 1,
          nodeCount: 2,
        },
      ],
    };
    const html = renderVpatHtml(
      data({
        productName: "<script>alert('pwn')</script>",
        pages: [
          {
            url: "https://acme.test/?q=<script>",
            pageTitle: "<img onerror=x>",
            scannedAt: "2026-07-19T08:00:00.000Z",
          },
        ],
        rows,
      }),
    );

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img onerror=x>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("makes no external requests", () => {
    const html = renderVpatHtml(data());

    // No fetchable subresource of any kind — the file must render offline.
    expect(html).not.toMatch(/<(script|img|iframe|link)\b/i);
    expect(html).not.toMatch(/\b(src|href)\s*=/i);
    expect(html).not.toMatch(/url\(/i);
  });

  it("states the per-criterion determination and its findings", () => {
    const rows = baseRows();
    const idx = rows.findIndex((r) => r.criterion.sc === "1.4.3");
    rows[idx] = {
      criterion: rows[idx]!.criterion,
      conformance: "Partially Supports",
      findings: [
        {
          ruleId: "color-contrast",
          help: "Elements must meet contrast thresholds",
          impact: "serious",
          pageCount: 2,
          nodeCount: 1,
        },
      ],
    };
    const html = renderVpatHtml(data({ rows }));

    expect(html).toContain("Partially Supports");
    expect(html).toContain(
      "<strong>color-contrast</strong> — Elements must meet contrast thresholds (1 instance across 2 pages)",
    );
    expect(html).toContain("No issues detected by automated checks.");
  });

  it("omits the appendix when nothing is unmapped, and includes it when something is", () => {
    expect(renderVpatHtml(data())).not.toContain("Appendix");

    const html = renderVpatHtml(
      data({
        unmapped: [
          {
            ruleId: "heading-order",
            help: "Heading levels should only increase by one",
            impact: "moderate",
            pageCount: 1,
            nodeCount: 1,
          },
        ],
      }),
    );
    expect(html).toContain("Appendix: findings not mapped");
    expect(html).toContain("heading-order");
  });

  it("describes the evaluation basis in page counts", () => {
    expect(renderVpatHtml(data())).toContain("1 page, automated scans via Mend (axe-core)");

    const html = renderVpatHtml(
      data({
        pages: [
          { url: "https://acme.test/a", pageTitle: "A", scannedAt: "2026-07-19T08:00:00.000Z" },
          { url: "https://acme.test/b", pageTitle: "B", scannedAt: "2026-07-19T08:00:00.000Z" },
        ],
      }),
    );
    expect(html).toContain("2 pages, automated scans via Mend (axe-core)");
  });
});
