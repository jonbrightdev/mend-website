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
