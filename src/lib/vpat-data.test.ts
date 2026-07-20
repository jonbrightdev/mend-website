import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { audit, user, violation } from "@/db/schema";
import type { Impact, ViolationNode } from "@/lib/dashboard-data";

// vpat-data imports "@/db", so it loads dynamically in beforeAll — after
// createTestDb() has seeded the global instance. A static import here would
// bind the module to the persisted ./.data/pglite instead.
let db: Awaited<ReturnType<typeof createTestDb>>;
let v: typeof import("@/lib/vpat-data");

let seq = 0;

async function seedRun(opts: {
  userId?: string;
  url: string;
  scannedAt: Date;
  violations?: { ruleId: string; tags: string[]; nodes?: number; impact?: Impact }[];
}) {
  const id = `vp-audit-${++seq}`;
  await db.insert(audit).values({
    id,
    userId: opts.userId ?? "vp-owner",
    url: opts.url,
    pageTitle: `Title for ${opts.url}`,
    scannedAt: opts.scannedAt,
  });
  for (const spec of opts.violations ?? []) {
    const nodes: ViolationNode[] = Array.from({ length: spec.nodes ?? 1 }, (_, i) => ({
      target: `#n${i}`,
      html: "<div></div>",
      failureSummary: "",
    }));
    await db.insert(violation).values({
      id: `vp-v-${++seq}`,
      auditId: id,
      ruleId: spec.ruleId,
      impact: spec.impact ?? "serious",
      help: `Help for ${spec.ruleId}`,
      description: "",
      tags: spec.tags,
      nodes,
    });
  }
  return id;
}

function rowFor(data: import("@/lib/vpat-data").VpatReportData, sc: string) {
  const row = data.rows.find((r) => r.criterion.sc === sc);
  if (!row) throw new Error(`no row for ${sc}`);
  return row;
}

beforeAll(async () => {
  db = await createTestDb();
  v = await import("@/lib/vpat-data");
  await db.insert(user).values([
    { id: "vp-owner", name: "Owner", email: "vp-owner@example.com" },
    { id: "vp-other", name: "Other", email: "vp-other@example.com" },
  ]);
});

beforeEach(async () => {
  await db.delete(audit);
});

describe("buildVpatData", () => {
  it("returns null when the user has no audits", async () => {
    expect(await v.buildVpatData("vp-owner", "Acme", "owner@example.com")).toBeNull();
  });

  it("determines Does Not Support when every page is affected", async () => {
    await seedRun({
      url: "https://acme.test/a",
      scannedAt: new Date("2026-07-01T10:00:00Z"),
      violations: [{ ruleId: "image-alt", tags: ["cat.text-alternatives", "1.1.1"] }],
    });
    await seedRun({
      url: "https://acme.test/b",
      scannedAt: new Date("2026-07-01T11:00:00Z"),
      violations: [{ ruleId: "image-alt", tags: ["cat.text-alternatives", "1.1.1"] }],
    });

    const data = (await v.buildVpatData("vp-owner", "Acme", "owner@example.com"))!;
    const row = rowFor(data, "1.1.1");

    expect(row.conformance).toBe("Does Not Support");
    expect(row.findings).toHaveLength(1);
    expect(row.findings[0]).toMatchObject({ ruleId: "image-alt", pageCount: 2, nodeCount: 2 });
  });

  it("determines Partially Supports when only some pages are affected", async () => {
    await seedRun({
      url: "https://acme.test/a",
      scannedAt: new Date("2026-07-01T10:00:00Z"),
      violations: [{ ruleId: "color-contrast", tags: ["cat.color", "1.4.3"], nodes: 4 }],
    });
    await seedRun({ url: "https://acme.test/b", scannedAt: new Date("2026-07-01T11:00:00Z") });

    const data = (await v.buildVpatData("vp-owner", "Acme", "owner@example.com"))!;
    const row = rowFor(data, "1.4.3");

    expect(row.conformance).toBe("Partially Supports");
    expect(row.findings[0]).toMatchObject({ pageCount: 1, nodeCount: 4 });
  });

  it("reports Supports with no findings for untouched criteria", async () => {
    await seedRun({
      url: "https://acme.test/a",
      scannedAt: new Date("2026-07-01T10:00:00Z"),
      violations: [{ ruleId: "image-alt", tags: ["1.1.1"] }],
    });

    const data = (await v.buildVpatData("vp-owner", "Acme", "owner@example.com"))!;
    const row = rowFor(data, "2.4.7");

    expect(row.conformance).toBe("Supports");
    expect(row.findings).toEqual([]);
  });

  it("covers every catalogued criterion exactly once, in catalogue order", async () => {
    await seedRun({ url: "https://acme.test/a", scannedAt: new Date("2026-07-01T10:00:00Z") });
    const { WCAG_22_CRITERIA } = await import("@/lib/wcag-criteria");

    const data = (await v.buildVpatData("vp-owner", "Acme", "owner@example.com"))!;

    expect(data.rows.map((r) => r.criterion.sc)).toEqual(WCAG_22_CRITERIA.map((c) => c.sc));
  });

  it("routes findings with no catalogued criterion into unmapped", async () => {
    await seedRun({
      url: "https://acme.test/a",
      scannedAt: new Date("2026-07-01T10:00:00Z"),
      violations: [
        // Category-only tags, a AAA criterion, and the criterion WCAG 2.2 removed.
        { ruleId: "heading-order", tags: ["cat.semantics", "best-practice"] },
        { ruleId: "some-aaa-rule", tags: ["1.4.6"] },
        { ruleId: "duplicate-id", tags: ["cat.parsing", "4.1.1"] },
      ],
    });

    const data = (await v.buildVpatData("vp-owner", "Acme", "owner@example.com"))!;

    expect(data.unmapped.map((f) => f.ruleId).sort()).toEqual([
      "duplicate-id",
      "heading-order",
      "some-aaa-rule",
    ]);
    // Nothing unmapped may leak into a criterion row.
    expect(data.rows.flatMap((r) => r.findings)).toEqual([]);
  });

  it("counts a multi-criterion rule against each criterion it fails", async () => {
    await seedRun({
      url: "https://acme.test/a",
      scannedAt: new Date("2026-07-01T10:00:00Z"),
      violations: [{ ruleId: "label", tags: ["cat.forms", "1.3.1", "4.1.2"], nodes: 3 }],
    });

    const data = (await v.buildVpatData("vp-owner", "Acme", "owner@example.com"))!;

    expect(rowFor(data, "1.3.1").findings[0]).toMatchObject({ nodeCount: 3 });
    expect(rowFor(data, "4.1.2").findings[0]).toMatchObject({ nodeCount: 3 });
  });

  it("uses only the latest run per URL, so a fixed issue stops counting", async () => {
    await seedRun({
      url: "https://acme.test/a",
      scannedAt: new Date("2026-07-01T10:00:00Z"),
      violations: [{ ruleId: "image-alt", tags: ["1.1.1"] }],
    });
    // Same page, later, clean.
    await seedRun({ url: "https://acme.test/a", scannedAt: new Date("2026-07-05T10:00:00Z") });

    const data = (await v.buildVpatData("vp-owner", "Acme", "owner@example.com"))!;

    expect(rowFor(data, "1.1.1").conformance).toBe("Supports");
    expect(data.pages).toEqual([
      {
        url: "https://acme.test/a",
        pageTitle: "Title for https://acme.test/a",
        scannedAt: "2026-07-05T10:00:00.000Z",
      },
    ]);
  });

  it("never sees another user's audits", async () => {
    await seedRun({
      userId: "vp-other",
      url: "https://other.test/a",
      scannedAt: new Date("2026-07-01T10:00:00Z"),
      violations: [{ ruleId: "image-alt", tags: ["1.1.1"] }],
    });

    expect(await v.buildVpatData("vp-owner", "Acme", "owner@example.com")).toBeNull();
  });

  it("falls back to the audited hostnames when no product name is given", async () => {
    await seedRun({ url: "https://acme.test/a", scannedAt: new Date("2026-07-01T10:00:00Z") });
    await seedRun({ url: "https://shop.acme.test/b", scannedAt: new Date("2026-07-01T11:00:00Z") });

    const data = (await v.buildVpatData("vp-owner", "   ", "owner@example.com"))!;

    expect(data.productName).toBe("acme.test, shop.acme.test");
  });

  it("orders findings by impact, then reach", async () => {
    await seedRun({
      url: "https://acme.test/a",
      scannedAt: new Date("2026-07-01T10:00:00Z"),
      violations: [
        { ruleId: "moderate-rule", tags: ["1.3.1"], impact: "moderate", nodes: 9 },
        { ruleId: "critical-rule", tags: ["1.3.1"], impact: "critical", nodes: 1 },
      ],
    });

    const data = (await v.buildVpatData("vp-owner", "Acme", "owner@example.com"))!;

    expect(rowFor(data, "1.3.1").findings.map((f) => f.ruleId)).toEqual([
      "critical-rule",
      "moderate-rule",
    ]);
  });
});

describe("defaultProductName", () => {
  it("de-duplicates hostnames and ignores unparseable URLs", async () => {
    expect(
      v.defaultProductName([
        { url: "https://acme.test/a" },
        { url: "https://acme.test/b" },
        { url: "not a url" },
      ]),
    ).toBe("acme.test");
  });
});
