import { describe, expect, it } from "vitest";
import {
  axeToIssues,
  categorize,
  toImpact,
  wcagFromTags,
  type AxeViolation,
} from "@/lib/scan/normalize";

function violation(over: Partial<AxeViolation> = {}): AxeViolation {
  return {
    id: "image-alt",
    impact: "critical",
    tags: ["cat.text-alternatives", "wcag2a", "wcag111"],
    help: "Images must have alternative text",
    description: "Ensures <img> elements have alternate text",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.12/image-alt",
    nodes: [
      {
        target: ["img.hero"],
        html: '<img class="hero" src="a.png">',
        failureSummary: "Fix any of the following:\n  Element has no alt attribute",
      },
    ],
    ...over,
  };
}

describe("wcagFromTags", () => {
  it("turns axe wcag tags into dotted criteria", () => {
    expect(wcagFromTags(["cat.color", "wcag2aa", "wcag143"])).toEqual(["1.4.3"]);
  });

  it("handles multi-digit third segments", () => {
    expect(wcagFromTags(["wcag412"])).toEqual(["4.1.2"]);
    expect(wcagFromTags(["wcag2411"])).toEqual(["2.4.11"]);
  });

  it("de-duplicates and sorts numerically", () => {
    // Plain string sort would put "1.4.10" before "1.4.3".
    expect(wcagFromTags(["wcag143", "wcag1410", "wcag143", "wcag111"])).toEqual([
      "1.1.1",
      "1.4.3",
      "1.4.10",
    ]);
  });

  it("ignores non-criterion tags", () => {
    expect(wcagFromTags(["cat.aria", "best-practice", "ACT", "wcag2a"])).toEqual([]);
  });
});

describe("categorize", () => {
  it("maps known cat.* tags to the extension's labels", () => {
    expect(categorize(["cat.color"])).toBe("contrast");
    expect(categorize(["cat.text-alternatives"])).toBe("images");
    expect(categorize(["cat.name-role-value"])).toBe("aria");
    expect(categorize(["cat.semantics"])).toBe("structure");
  });

  it("falls back to other when no cat.* tag is recognised", () => {
    expect(categorize(["wcag2a", "best-practice"])).toBe("other");
    expect(categorize([])).toBe("other");
  });
});

describe("toImpact", () => {
  it("passes the four valid impacts through", () => {
    for (const i of ["critical", "serious", "moderate", "minor"] as const) {
      expect(toImpact(i)).toBe(i);
    }
  });

  it("falls back to minor rather than dropping the finding", () => {
    expect(toImpact(null)).toBe("minor");
    expect(toImpact(undefined)).toBe("minor");
    expect(toImpact("catastrophic")).toBe("minor");
  });
});

describe("axeToIssues", () => {
  it("emits one flat issue per affected element", () => {
    const issues = axeToIssues([
      violation({
        nodes: [
          { target: ["img.a"], html: "<img>" },
          { target: ["img.b"], html: "<img>" },
        ],
      }),
    ]);

    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.selector)).toEqual(["img.a", "img.b"]);
  });

  it("maps a violation into the ingest issue shape", () => {
    const [issue] = axeToIssues([violation()]);

    expect(issue).toMatchObject({
      ruleId: "image-alt",
      impact: "critical",
      category: "images",
      wcag: ["1.1.1"],
      title: "Images must have alternative text",
      description: "Ensures <img> elements have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.12/image-alt",
      selector: "img.hero",
      domOrder: 0,
    });
  });

  it("joins nested targets with the extension's separator", () => {
    const [issue] = axeToIssues([
      violation({ nodes: [{ target: ["#frame", "img.inner"], html: "<img>" }] }),
    ]);
    expect(issue!.selector).toBe("#frame > img.inner");
  });

  it("prefers the node's impact over the violation's", () => {
    const [issue] = axeToIssues([
      violation({ impact: "critical", nodes: [{ target: ["a"], html: "<a>", impact: "moderate" }] }),
    ]);
    expect(issue!.impact).toBe("moderate");
  });

  it("falls back to the violation's impact, then to minor", () => {
    const [fromViolation] = axeToIssues([
      violation({ impact: "serious", nodes: [{ target: ["a"], html: "<a>" }] }),
    ]);
    expect(fromViolation!.impact).toBe("serious");

    const [fallback] = axeToIssues([
      violation({ impact: null, nodes: [{ target: ["a"], html: "<a>", impact: null }] }),
    ]);
    expect(fallback!.impact).toBe("minor");
  });

  it("clips html at 500 characters", () => {
    const [issue] = axeToIssues([
      violation({ nodes: [{ target: ["div"], html: "x".repeat(900) }] }),
    ]);
    expect(issue!.html).toHaveLength(500);
  });

  it("collapses the multi-line failure summary into one line", () => {
    const [issue] = axeToIssues([violation()]);
    expect(issue!.failureSummary).toBe(
      "Fix any of the following: Element has no alt attribute",
    );
  });

  it("leaves failureSummary undefined when axe gave none", () => {
    const [issue] = axeToIssues([
      violation({ nodes: [{ target: ["a"], html: "<a>" }] }),
    ]);
    expect(issue!.failureSummary).toBeUndefined();
  });

  it("numbers domOrder continuously across violations", () => {
    const issues = axeToIssues([
      violation({ nodes: [{ target: ["a"], html: "<a>" }, { target: ["b"], html: "<b>" }] }),
      violation({ id: "color-contrast", nodes: [{ target: ["c"], html: "<c>" }] }),
    ]);
    expect(issues.map((i) => i.domOrder)).toEqual([0, 1, 2]);
  });

  it("drops an empty helpUrl rather than storing a blank string", () => {
    const [issue] = axeToIssues([violation({ helpUrl: "" })]);
    expect(issue!.helpUrl).toBeUndefined();
  });

  it("returns nothing for a clean page", () => {
    expect(axeToIssues([])).toEqual([]);
  });
});
