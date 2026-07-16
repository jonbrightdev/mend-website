import { describe, expect, it } from "vitest";
import {
  aggregateTrend,
  byRule,
  countsByImpact,
  ruleSpecFor,
  wcagUnderstandingUrl,
  type AuditRecord,
  type Impact,
  type Violation,
} from "@/lib/dashboard-data";

function node(target: string) {
  return { target, html: `<${target}>`, failureSummary: "" };
}

function violation(id: string, impact: Impact, nodeCount: number): Violation {
  return {
    id,
    impact,
    help: `${id} help`,
    helpUrl: `https://example.com/${id}`,
    description: `${id} description`,
    tags: [],
    nodes: Array.from({ length: nodeCount }, (_, i) => node(`el-${i}`)),
  };
}

function audit(id: string, url: string, violations: Violation[], history: number[] = []): AuditRecord {
  return {
    id,
    url,
    pageTitle: url,
    scannedAt: "2026-07-01T00:00:00.000Z",
    history,
    violations,
  };
}

describe("byRule", () => {
  it("aggregates node counts and page counts across audits", () => {
    const rows = byRule([
      audit("a1", "https://example.com/one", [violation("image-alt", "critical", 2)]),
      audit("a2", "https://example.com/two", [violation("image-alt", "critical", 3)]),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ruleId: "image-alt", count: 5, pageCount: 2, auditId: "a1" });
  });

  it("counts one page once even when a rule repeats within it", () => {
    const rows = byRule([
      audit("a1", "https://example.com/one", [violation("image-alt", "critical", 2)]),
      audit("a2", "https://example.com/one", [violation("image-alt", "critical", 1)]),
    ]);

    expect(rows[0]).toMatchObject({ count: 3, pageCount: 1 });
  });

  it("sorts by impact rank, then by count descending", () => {
    const rows = byRule([
      audit("a1", "https://example.com/one", [
        violation("minor-rule", "minor", 50),
        violation("serious-few", "serious", 1),
        violation("serious-many", "serious", 9),
        violation("critical-rule", "critical", 1),
      ]),
    ]);

    expect(rows.map((r) => r.ruleId)).toEqual([
      "critical-rule",
      "serious-many",
      "serious-few",
      "minor-rule",
    ]);
  });
});

describe("countsByImpact", () => {
  it("totals nodes per impact across audits", () => {
    const counts = countsByImpact([
      audit("a1", "https://example.com/one", [
        violation("image-alt", "critical", 2),
        violation("color-contrast", "serious", 3),
      ]),
      audit("a2", "https://example.com/two", [violation("image-alt", "critical", 1)]),
    ]);

    expect(counts).toEqual({ critical: 3, serious: 3, moderate: 0, minor: 0 });
  });
});

describe("aggregateTrend", () => {
  it("sums history[i] across audits per run date", () => {
    const runDates = ["2026-07-01", "2026-07-02", "2026-07-03"];
    const trend = aggregateTrend(
      [
        audit("a1", "https://example.com/one", [], [5, 3, 1]),
        audit("a2", "https://example.com/two", [], [2, 2, 2]),
      ],
      runDates,
    );

    expect(trend).toEqual([
      { date: "2026-07-01", total: 7 },
      { date: "2026-07-02", total: 5 },
      { date: "2026-07-03", total: 3 },
    ]);
  });

  it("treats a missing history entry as zero", () => {
    const trend = aggregateTrend([audit("a1", "https://example.com/one", [], [4])], [
      "2026-07-01",
      "2026-07-02",
    ]);

    expect(trend).toEqual([
      { date: "2026-07-01", total: 4 },
      { date: "2026-07-02", total: 0 },
    ]);
  });
});

describe("wcagUnderstandingUrl", () => {
  it("maps a known criterion label to its official Understanding page", () => {
    expect(wcagUnderstandingUrl("1.1.1 Non-text Content (A)")).toBe(
      "https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html",
    );
  });

  it("uses the explicit slug where it differs from the label", () => {
    expect(wcagUnderstandingUrl("2.4.4 Link Purpose (A)")).toBe(
      "https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html",
    );
  });

  it("returns null for a criterion we have no verified slug for", () => {
    expect(wcagUnderstandingUrl("9.9.9 Made Up (AAA)")).toBeNull();
    expect(wcagUnderstandingUrl("not a criterion")).toBeNull();
  });
});

describe("ruleSpecFor", () => {
  it("returns the hand-written catalogue entry for a known rule", () => {
    const spec = ruleSpecFor(violation("image-alt", "critical", 1));

    expect(spec.help).toBe("Images must have alternative text");
    expect(spec.before).toBe('<img src="/team/ana.jpg">');
    expect(spec.wcag).toEqual(["1.1.1 Non-text Content (A)"]);
  });

  it("synthesizes a spec from the violation for an unknown rule", () => {
    const unknown: Violation = {
      ...violation("some-new-rule", "moderate", 1),
      tags: ["1.3.1", "cat.semantics"],
    };

    const spec = ruleSpecFor(unknown);

    expect(spec.impact).toBe("moderate");
    expect(spec.help).toBe("some-new-rule help");
    expect(spec.fix).toContain("doesn't have a hand-written fix for this rule yet");
    expect(spec.before).toBeUndefined();
    // Only bare criterion numbers are treated as WCAG entries.
    expect(spec.wcag).toEqual(["1.3.1"]);
    expect(spec.tags).toEqual(["1.3.1", "cat.semantics"]);
  });
});
