import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { hashKey } from "@/lib/api-key";
import { apiKey, audit, user, violation } from "@/db/schema";

// Covers buildExport's isolation guarantee: a user's bundle contains exactly
// their own data, never another account's. The route/schema tables are safe
// to import statically (they touch no connection), but export-data.ts pulls
// in "@/db", so it is imported dynamically in beforeAll — after createTestDb()
// has put the in-memory instance on globalThis for "@/db" to pick up.

const USER_A = "u-export-a";
const USER_B = "u-export-b";

let db: Awaited<ReturnType<typeof createTestDb>>;
let buildExport: (typeof import("@/lib/export-data"))["buildExport"];

describe("buildExport", () => {
  beforeAll(async () => {
    db = await createTestDb();

    await db.insert(user).values([
      { id: USER_A, name: "Ada", email: "ada@example.com" },
      { id: USER_B, name: "Bea", email: "bea@example.com" },
    ]);

    await db.insert(apiKey).values([
      {
        id: "k-a",
        userId: USER_A,
        hashedKey: await hashKey("mend_key_a"),
        name: "Ada's key",
      },
      {
        id: "k-b",
        userId: USER_B,
        hashedKey: await hashKey("mend_key_b"),
        name: "Bea's key",
      },
    ]);

    await db.insert(audit).values([
      {
        id: "a-1",
        userId: USER_A,
        url: "https://example.com/pricing",
        pageTitle: "Pricing",
        scannedAt: new Date("2026-07-01T12:00:00.000Z"),
        durationMs: 1200,
        totalChecks: 40,
        partial: false,
      },
      {
        id: "b-1",
        userId: USER_B,
        url: "https://example.com/about",
        pageTitle: "About",
        scannedAt: new Date("2026-07-02T12:00:00.000Z"),
        durationMs: 900,
        totalChecks: 30,
        partial: false,
      },
    ]);

    await db.insert(violation).values([
      {
        id: "v-a-1",
        auditId: "a-1",
        ruleId: "image-alt",
        impact: "critical",
        help: "Images must have alternative text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
        description: "Ensures <img> elements have alternate text",
        tags: ["wcag2a", "wcag111"],
        nodes: [{ target: "img.hero", html: "<img>", failureSummary: "no alt" }],
      },
      {
        id: "v-b-1",
        auditId: "b-1",
        ruleId: "color-contrast",
        impact: "serious",
        help: "Elements must meet minimum color contrast ratio thresholds",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
        description: "Ensures contrast between foreground and background",
        tags: ["wcag2aa", "wcag143"],
        nodes: [{ target: "a.cta", html: "<a>", failureSummary: "2.1:1" }],
      },
    ]);

    const mod = await import("@/lib/export-data");
    buildExport = mod.buildExport;
  });

  it("includes exactly the caller's audits, violations, and key metadata", async () => {
    const bundle = await buildExport(USER_A);

    expect(bundle.format).toBe("mend-export/v1");
    expect(bundle.user).toEqual({
      name: "Ada",
      email: "ada@example.com",
      createdAt: expect.any(String),
    });

    expect(bundle.audits).toHaveLength(1);
    expect(bundle.audits[0]).toMatchObject({
      url: "https://example.com/pricing",
      pageTitle: "Pricing",
    });
    expect(bundle.audits[0]!.violations).toHaveLength(1);
    expect(bundle.audits[0]!.violations[0]).toMatchObject({
      ruleId: "image-alt",
      impact: "critical",
    });

    expect(bundle.apiKeys).toHaveLength(1);
    expect(bundle.apiKeys[0]).toMatchObject({ name: "Ada's key" });
  });

  it("never leaks another user's data or key ids/hashes", async () => {
    const bundle = await buildExport(USER_A);

    expect(bundle.audits.some((a) => a.url === "https://example.com/about")).toBe(
      false,
    );
    expect(
      bundle.audits.flatMap((a) => a.violations).some((v) => v.ruleId === "color-contrast"),
    ).toBe(false);

    expect(bundle.apiKeys[0]).not.toHaveProperty("id");
    expect(bundle.apiKeys[0]).not.toHaveProperty("hashedKey");
  });
});
