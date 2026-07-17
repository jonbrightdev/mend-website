import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { audit, user, violation } from "@/db/schema";

// Smoke test for the harness itself: the migrations replay, the schema is
// usable, and rows survive a round trip. Later plans build their DB tests on
// this, so a failure here means the harness — not the app — is broken.
describe("createTestDb", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    db = await createTestDb();
  });

  it("applies the migrations and round-trips a user", async () => {
    await db.insert(user).values({ id: "u1", name: "Ada", email: "ada@example.com" });

    const rows = await db.select().from(user).where(eq(user.id, "u1"));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Ada", email: "ada@example.com" });
    // Defaults from the migration, not from the insert.
    expect(rows[0]!.emailVerified).toBe(false);
    expect(rows[0]!.createdAt).toBeInstanceOf(Date);
  });

  it("round-trips an audit with its jsonb violation", async () => {
    await db.insert(user).values({ id: "u2", name: "Grace", email: "grace@example.com" });
    const scannedAt = new Date("2026-07-01T12:00:00.000Z");
    await db.insert(audit).values({
      id: "a1",
      userId: "u2",
      url: "https://example.com/pricing",
      pageTitle: "Pricing",
      scannedAt,
    });
    await db.insert(violation).values({
      id: "v1",
      auditId: "a1",
      ruleId: "image-alt",
      impact: "critical",
      help: "Images must have alternative text",
      helpUrl: null,
      description: "Ensures <img> elements have alternate text",
      tags: ["cat.text-alternatives"],
      nodes: [{ target: "img.hero", html: "<img>", failureSummary: "no alt" }],
    });

    const [run] = await db.select().from(audit).where(eq(audit.id, "a1"));
    const rows = await db.select().from(violation).where(eq(violation.auditId, "a1"));

    expect(run).toMatchObject({ url: "https://example.com/pricing", partial: false });
    expect(run!.scannedAt).toEqual(scannedAt);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nodes).toEqual([{ target: "img.hero", html: "<img>", failureSummary: "no alt" }]);
    expect(rows[0]!.tags).toEqual(["cat.text-alternatives"]);
  });

  it("enforces the unique index that makes ingest idempotent", async () => {
    await db.insert(user).values({ id: "u3", name: "Alan", email: "alan@example.com" });
    const scannedAt = new Date("2026-07-02T12:00:00.000Z");
    const values = {
      id: "a2",
      userId: "u3",
      url: "https://example.com/about",
      pageTitle: "About",
      scannedAt,
    };
    await db.insert(audit).values(values);

    // Same (userId, url, scannedAt) with a fresh id: the index must reject it.
    const inserted = await db
      .insert(audit)
      .values({ ...values, id: "a3" })
      .onConflictDoNothing()
      .returning();

    expect(inserted).toHaveLength(0);
  });
});
