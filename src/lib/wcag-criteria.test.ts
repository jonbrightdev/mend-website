import { describe, expect, it } from "vitest";
import { WCAG_22_BY_SC, WCAG_22_CRITERIA } from "@/lib/wcag-criteria";

describe("WCAG_22_CRITERIA", () => {
  // Counts verified against https://www.w3.org/TR/WCAG22/ at execution time by
  // parsing every "Success Criterion" section's own conformance-level marker.
  // If a future WCAG edition contradicts these, the W3C list wins.
  it("holds all 31 Level A and 24 Level AA criteria", () => {
    const a = WCAG_22_CRITERIA.filter((c) => c.level === "A");
    const aa = WCAG_22_CRITERIA.filter((c) => c.level === "AA");

    expect(a).toHaveLength(31);
    expect(aa).toHaveLength(24);
    expect(WCAG_22_CRITERIA).toHaveLength(55);
  });

  it("has no duplicate criterion numbers", () => {
    const seen = new Set(WCAG_22_CRITERIA.map((c) => c.sc));
    expect(seen.size).toBe(WCAG_22_CRITERIA.length);
  });

  it("omits 4.1.1 Parsing, which WCAG 2.2 removed", () => {
    expect(WCAG_22_BY_SC.has("4.1.1")).toBe(false);
    // Its neighbours are still present, so this is an omission and not a gap.
    expect(WCAG_22_BY_SC.get("4.1.2")?.level).toBe("A");
    expect(WCAG_22_BY_SC.get("4.1.3")?.level).toBe("AA");
  });

  it("carries the right level and name for well-known criteria", () => {
    expect(WCAG_22_BY_SC.get("1.1.1")).toEqual({
      sc: "1.1.1",
      name: "Non-text Content",
      level: "A",
    });
    expect(WCAG_22_BY_SC.get("1.4.3")).toEqual({
      sc: "1.4.3",
      name: "Contrast (Minimum)",
      level: "AA",
    });
    expect(WCAG_22_BY_SC.get("2.4.7")).toEqual({
      sc: "2.4.7",
      name: "Focus Visible",
      level: "AA",
    });
    // Both new in WCAG 2.2.
    expect(WCAG_22_BY_SC.get("2.5.8")).toEqual({
      sc: "2.5.8",
      name: "Target Size (Minimum)",
      level: "AA",
    });
    expect(WCAG_22_BY_SC.get("3.3.7")).toEqual({
      sc: "3.3.7",
      name: "Redundant Entry",
      level: "A",
    });
  });

  it("stays in specification order", () => {
    // Numeric per segment, so 1.4.5 sorts before 1.4.10 the way the spec lists
    // them — a plain string sort would not.
    const key = (sc: string) => sc.split(".").map(Number);
    for (let i = 1; i < WCAG_22_CRITERIA.length; i++) {
      const prev = key(WCAG_22_CRITERIA[i - 1]!.sc);
      const cur = key(WCAG_22_CRITERIA[i]!.sc);
      const firstDiff = prev.findIndex((n, j) => n !== cur[j]);
      expect(prev[firstDiff]!).toBeLessThan(cur[firstDiff]!);
    }
  });
});
