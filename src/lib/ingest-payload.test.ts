import { describe, expect, it } from "vitest";
import {
  IngestError,
  groupViolations,
  parsePayload,
  type IngestIssue,
} from "@/lib/ingest-payload";

// A fully-populated issue as the extension sends it. Tests override single
// fields so each case states only what it is actually about.
function issue(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: "image-alt",
    impact: "critical",
    category: "cat.text-alternatives",
    wcag: ["1.1.1 Non-text Content (A)"],
    title: "Images must have alternative text",
    description: "Ensures <img> elements have alternate text",
    helpUrl: "https://example.com/rules/image-alt",
    selector: "img.hero",
    html: '<img src="hero.jpg">',
    failureSummary: "Element has no alt attribute",
    domOrder: 0,
    ...overrides,
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://example.com/pricing",
    pageTitle: "Pricing",
    startedAt: 1_700_000_000_000,
    durationMs: 1234.6,
    totalChecks: 42.4,
    partial: true,
    issues: [issue()],
    ...overrides,
  };
}

describe("parsePayload", () => {
  it("parses a full valid payload", () => {
    const result = parsePayload(payload());

    expect(result.url).toBe("https://example.com/pricing");
    expect(result.pageTitle).toBe("Pricing");
    expect(result.scannedAt).toEqual(new Date(1_700_000_000_000));
    expect(result.partial).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      ruleId: "image-alt",
      impact: "critical",
      category: "cat.text-alternatives",
      selector: "img.hero",
      domOrder: 0,
    });
  });

  it("rounds durationMs and totalChecks to integers", () => {
    const result = parsePayload(payload());

    expect(result.durationMs).toBe(1235);
    expect(result.totalChecks).toBe(42);
  });

  it.each([
    ["a non-object body", "not an object"],
    ["a null body", null],
  ])("rejects %s", (_label, body) => {
    expect(() => parsePayload(body)).toThrow(IngestError);
    expect(() => parsePayload(body)).toThrow("body must be an object");
  });

  it("rejects a missing url", () => {
    expect(() => parsePayload(payload({ url: undefined }))).toThrow(IngestError);
    expect(() => parsePayload(payload({ url: undefined }))).toThrow("url must be a string");
  });

  it("rejects a non-string url", () => {
    expect(() => parsePayload(payload({ url: 42 }))).toThrow("url must be a string");
  });

  it("rejects a non-http(s) url", () => {
    expect(() => parsePayload(payload({ url: "ftp://x" }))).toThrow("url must be an http(s) URL");
  });

  it("rejects a missing startedAt", () => {
    expect(() => parsePayload(payload({ startedAt: undefined }))).toThrow(
      "startedAt must be an epoch-ms number",
    );
  });

  it("rejects a non-array issues", () => {
    expect(() => parsePayload(payload({ issues: "none" }))).toThrow("issues must be an array");
  });

  it("rejects an issue with an invalid impact", () => {
    expect(() => parsePayload(payload({ issues: [issue({ impact: "catastrophic" })] }))).toThrow(
      "issues[0].impact must be one of critical|serious|moderate|minor",
    );
  });

  it("rejects an issue with an empty ruleId", () => {
    expect(() => parsePayload(payload({ issues: [issue({ ruleId: "" })] }))).toThrow(
      "issues[0].ruleId is empty",
    );
  });

  it("falls back to the url when pageTitle is missing", () => {
    const result = parsePayload(payload({ pageTitle: undefined }));

    expect(result.pageTitle).toBe("https://example.com/pricing");
  });

  it("falls back to the array index when domOrder is missing", () => {
    const result = parsePayload(
      payload({ issues: [issue({ domOrder: undefined }), issue({ domOrder: undefined })] }),
    );

    expect(result.issues.map((i) => i.domOrder)).toEqual([0, 1]);
  });

  it("filters non-string entries out of wcag", () => {
    const result = parsePayload(payload({ issues: [issue({ wcag: ["1.1.1", 42, null, "4.1.2"] })] }));

    expect(result.issues[0]!.wcag).toEqual(["1.1.1", "4.1.2"]);
  });
});

// Identifiers reject and content truncates — get that backwards and an audit is
// either silently dropped or silently mis-attributed. Each case names which.
describe("parsePayload limits", () => {
  const long = (n: number) => "x".repeat(n);

  it("rejects a url over 2000 chars", () => {
    expect(() => parsePayload(payload({ url: `https://example.com/${long(2_000)}` }))).toThrow(
      "url is too long",
    );
  });

  it("rejects more than 1000 issues", () => {
    const issues = Array.from({ length: 1_001 }, () => issue());

    expect(() => parsePayload(payload({ issues }))).toThrow(IngestError);
    expect(() => parsePayload(payload({ issues }))).toThrow("too many issues (max 1000)");
  });

  it("accepts exactly 1000 issues", () => {
    const issues = Array.from({ length: 1_000 }, () => issue());

    expect(parsePayload(payload({ issues })).issues).toHaveLength(1_000);
  });

  it("rejects a ruleId over 200 chars", () => {
    expect(() => parsePayload(payload({ issues: [issue({ ruleId: long(201) })] }))).toThrow(
      "issues[0].ruleId is too long",
    );
  });

  it("truncates html to 5000 chars rather than dropping the audit", () => {
    const result = parsePayload(payload({ issues: [issue({ html: long(10_000) })] }));

    expect(result.issues[0]!.html).toHaveLength(5_000);
  });

  it("truncates title, description, selector and failureSummary", () => {
    const result = parsePayload(
      payload({
        issues: [
          issue({
            title: long(1_000),
            description: long(5_000),
            selector: long(5_000),
            failureSummary: long(10_000),
            category: long(500),
          }),
        ],
      }),
    );

    expect(result.issues[0]!.title).toHaveLength(500);
    expect(result.issues[0]!.description).toHaveLength(2_000);
    expect(result.issues[0]!.selector).toHaveLength(2_000);
    expect(result.issues[0]!.failureSummary).toHaveLength(5_000);
    expect(result.issues[0]!.category).toHaveLength(200);
  });

  it("truncates a pageTitle over 500 chars", () => {
    const result = parsePayload(payload({ pageTitle: long(1_000) }));

    expect(result.pageTitle).toHaveLength(500);
  });

  it("drops an oversized helpUrl instead of storing a truncated, broken link", () => {
    const result = parsePayload(payload({ issues: [issue({ helpUrl: long(5_000) })] }));

    expect(result.issues[0]!.helpUrl).toBeUndefined();
  });

  it("rejects a startedAt more than a day in the future", () => {
    expect(() => parsePayload(payload({ startedAt: Date.now() + 2 * 86_400_000 }))).toThrow(
      "startedAt is in the future",
    );
  });

  it("accepts a startedAt slightly in the future, for clock skew", () => {
    const startedAt = Date.now() + 60_000;

    expect(parsePayload(payload({ startedAt })).scannedAt).toEqual(new Date(startedAt));
  });

  it("rejects a startedAt from before the extension existed", () => {
    expect(() => parsePayload(payload({ startedAt: Date.UTC(2019, 0, 1) }))).toThrow(
      "startedAt is unreasonably old",
    );
  });

  it("keeps only the first 25 wcag entries", () => {
    const wcag = Array.from({ length: 30 }, (_, i) => `1.1.${i}`);
    const result = parsePayload(payload({ issues: [issue({ wcag })] }));

    expect(result.issues[0]!.wcag).toHaveLength(25);
    expect(result.issues[0]!.wcag[0]).toBe("1.1.0");
  });

  it("filters out wcag entries over 200 chars", () => {
    const result = parsePayload(payload({ issues: [issue({ wcag: ["1.1.1", long(201)] })] }));

    expect(result.issues[0]!.wcag).toEqual(["1.1.1"]);
  });

  it.each([
    ["out-of-range", 5e9],
    ["negative", -1],
    ["infinite", Infinity],
  ])("drops a %s durationMs and totalChecks", (_label, value) => {
    const result = parsePayload(payload({ durationMs: value, totalChecks: value }));

    expect(result.durationMs).toBeUndefined();
    expect(result.totalChecks).toBeUndefined();
  });

  it("falls back to the array index for an out-of-range domOrder", () => {
    const result = parsePayload(
      payload({ issues: [issue({ domOrder: -5 }), issue({ domOrder: 1e9 })] }),
    );

    expect(result.issues.map((i) => i.domOrder)).toEqual([0, 1]);
  });
});

describe("groupViolations", () => {
  // groupViolations consumes parsed issues, so build them through parsePayload
  // rather than hand-rolling the IngestIssue shape.
  function parsedIssues(raw: Record<string, unknown>[]): IngestIssue[] {
    return parsePayload(payload({ issues: raw })).issues;
  }

  it("groups issues sharing a ruleId into one violation", () => {
    const violations = groupViolations(
      "audit-1",
      parsedIssues([issue({ selector: "img.a" }), issue({ selector: "img.b" })]),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]!.ruleId).toBe("image-alt");
    expect(violations[0]!.nodes).toHaveLength(2);
    expect(violations[0]!.auditId).toBe("audit-1");
  });

  it("sorts nodes by domOrder", () => {
    const violations = groupViolations(
      "audit-1",
      parsedIssues([
        issue({ selector: "img.last", domOrder: 9 }),
        issue({ selector: "img.first", domOrder: 1 }),
        issue({ selector: "img.middle", domOrder: 4 }),
      ]),
    );

    expect(violations[0]!.nodes.map((n) => n.target)).toEqual(["img.first", "img.middle", "img.last"]);
  });

  it("builds tags from the first issue's category plus de-duplicated wcag", () => {
    const violations = groupViolations(
      "audit-1",
      parsedIssues([
        issue({ wcag: ["1.1.1 Non-text Content (A)"] }),
        issue({ wcag: ["1.1.1 Non-text Content (A)", "4.1.2 Name, Role, Value (A)"] }),
      ]),
    );

    expect(violations[0]!.tags).toEqual([
      "cat.text-alternatives",
      "1.1.1 Non-text Content (A)",
      "4.1.2 Name, Role, Value (A)",
    ]);
  });

  it("produces one violation per distinct ruleId", () => {
    const violations = groupViolations(
      "audit-1",
      parsedIssues([issue({ ruleId: "image-alt" }), issue({ ruleId: "link-name" })]),
    );

    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.ruleId)).toEqual(["image-alt", "link-name"]);
    expect(new Set(violations.map((v) => v.id)).size).toBe(2);
  });
});
