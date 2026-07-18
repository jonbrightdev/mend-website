import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { account, apiKey, audit, user, violation } from "@/db/schema";

// Covers the per-user active-key quota. account-queries imports "@/db", so it
// is imported dynamically in beforeAll — after createTestDb() has put the
// in-memory instance on globalThis for "@/db" to pick up.

let db: Awaited<ReturnType<typeof createTestDb>>;
let assertKeyQuota: (userId: string) => Promise<void>;
let MAX_ACTIVE_KEYS: number;

async function seedKeys(userId: string, count: number, revoked = false) {
  if (count === 0) return;
  await db.insert(apiKey).values(
    Array.from({ length: count }, (_, i) => ({
      id: `k-${userId}-${revoked ? "r" : "a"}-${i}`,
      userId,
      hashedKey: `hash-${userId}-${revoked ? "r" : "a"}-${i}`,
      name: `Key ${i}`,
      revokedAt: revoked ? new Date() : null,
    })),
  );
}

async function seedUser(id: string) {
  await db.insert(user).values({ id, name: "Ada", email: `${id}@example.com` });
}

describe("assertKeyQuota", () => {
  beforeAll(async () => {
    db = await createTestDb();
    const mod = await import("@/lib/account-queries");
    assertKeyQuota = mod.assertKeyQuota;
    MAX_ACTIVE_KEYS = mod.MAX_ACTIVE_KEYS;
  });

  it("allows a user under the cap", async () => {
    await seedUser("u-under");
    await seedKeys("u-under", 19);

    await expect(assertKeyQuota("u-under")).resolves.toBeUndefined();
  });

  it("allows a user with no keys at all", async () => {
    await seedUser("u-empty");

    await expect(assertKeyQuota("u-empty")).resolves.toBeUndefined();
  });

  it("refuses a user at the cap", async () => {
    await seedUser("u-at-cap");
    await seedKeys("u-at-cap", MAX_ACTIVE_KEYS);

    await expect(assertKeyQuota("u-at-cap")).rejects.toThrow(
      "Key limit reached. Revoke an unused key first.",
    );
  });

  // Revoking has to free a slot, or a user who rotates keys 20 times is locked
  // out forever with no way back.
  it("ignores revoked keys when counting", async () => {
    await seedUser("u-revoked");
    await seedKeys("u-revoked", 50, true);
    await seedKeys("u-revoked", 1);

    await expect(assertKeyQuota("u-revoked")).resolves.toBeUndefined();
  });

  it("counts each user's keys separately", async () => {
    await seedUser("u-other");
    await seedKeys("u-other", 1);

    await expect(assertKeyQuota("u-other")).resolves.toBeUndefined();
  });
});

// userHasPassword drives the delete-account UI branch: OAuth-only users have
// no "credential" account row and must not be asked for a password. The "@/db"
// binding is fixed at the module's first import, so this reuses the suite db
// when the quota block already created it, and creates one when run alone.
describe("userHasPassword", () => {
  let userHasPassword: (userId: string) => Promise<boolean>;

  beforeAll(async () => {
    db ??= await createTestDb();
    const mod = await import("@/lib/account-queries");
    userHasPassword = mod.userHasPassword;
  });

  async function seedAccount(id: string, userId: string, providerId: string) {
    await db.insert(account).values({ id, accountId: id, userId, providerId });
  }

  it("is true for a user with a credential account", async () => {
    await seedUser("u-pw");
    await seedAccount("acc-pw", "u-pw", "credential");

    await expect(userHasPassword("u-pw")).resolves.toBe(true);
  });

  it("is false for an OAuth-only user", async () => {
    await seedUser("u-oauth");
    await seedAccount("acc-oauth", "u-oauth", "github");

    await expect(userHasPassword("u-oauth")).resolves.toBe(false);
  });

  it("is false for a user with no account rows at all", async () => {
    await seedUser("u-none");

    await expect(userHasPassword("u-none")).resolves.toBe(false);
  });
});

// deleteAllAudits runs `db.delete(audit).where(eq(audit.userId, user.id))`
// inside a createServerFn wrapper that Vitest can't invoke directly, so this
// exercises that exact owner-scoped query at the Drizzle level. The critical
// case is the cascade: deleting the audit must take its violation rows with it,
// or orphaned page snippets survive a "delete".
describe("deleteAllAudits (owner-scoped cascade delete)", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;

  async function seedAudit(id: string, userId: string, nodeCount: number) {
    await db.insert(audit).values({
      id,
      userId,
      url: `https://example.com/${id}`,
      pageTitle: id,
      scannedAt: new Date("2026-07-01T12:00:00.000Z"),
    });
    await db.insert(violation).values({
      id: `v-${id}`,
      auditId: id,
      ruleId: "image-alt",
      impact: "critical",
      help: "Images must have alternative text",
      helpUrl: "",
      description: "",
      tags: [],
      nodes: Array.from({ length: nodeCount }, () => ({
        target: "img",
        html: "<img>",
        failureSummary: "no alt",
      })),
    });
  }

  beforeAll(async () => {
    db = await createTestDb();
    await db.insert(user).values([
      { id: "u-del", name: "Ada", email: "del@example.com" },
      { id: "u-keep", name: "Bo", email: "keep@example.com" },
    ]);
    await seedAudit("a-del-1", "u-del", 2);
    await seedAudit("a-del-2", "u-del", 1);
    await seedAudit("a-keep-1", "u-keep", 3);
  });

  it("deletes the owner's audits and their violations, sparing other users", async () => {
    await db.delete(audit).where(eq(audit.userId, "u-del"));

    const delAudits = await db
      .select()
      .from(audit)
      .where(eq(audit.userId, "u-del"));
    expect(delAudits).toHaveLength(0);

    // The cascade is the point: no orphaned violation rows remain.
    const delViolations = await db
      .select()
      .from(violation)
      .where(eq(violation.auditId, "a-del-1"));
    expect(delViolations).toHaveLength(0);

    const keepAudits = await db
      .select()
      .from(audit)
      .where(eq(audit.userId, "u-keep"));
    expect(keepAudits).toHaveLength(1);
    const keepViolations = await db
      .select()
      .from(violation)
      .where(eq(violation.auditId, "a-keep-1"));
    expect(keepViolations).toHaveLength(1);
  });
});
