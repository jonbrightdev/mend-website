import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { account, apiKey, audit, user, violation } from "@/db/schema";
import { PLAN_LIMITS } from "@/lib/entitlements";

// Covers the per-user active-key quota. account-queries imports "@/db", so it
// is imported dynamically in beforeAll — after createTestDb() has put the
// in-memory instance on globalThis for "@/db" to pick up.

let db: Awaited<ReturnType<typeof createTestDb>>;
let assertKeyQuota: (userId: string) => Promise<void>;
let seedProSubscription: (userId: string) => Promise<void>;
let MAX_ACTIVE_KEYS: number;

// `batch` distinguishes repeat calls for the same user, whose ids and hashes
// would otherwise collide with the keys seeded by the earlier call.
async function seedKeys(userId: string, count: number, revoked = false, batch = "") {
  if (count === 0) return;
  await db.insert(apiKey).values(
    Array.from({ length: count }, (_, i) => ({
      id: `k-${userId}-${revoked ? "r" : "a"}${batch}-${i}`,
      userId,
      hashedKey: `hash-${userId}-${revoked ? "r" : "a"}${batch}-${i}`,
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
    seedProSubscription = (await import("@/lib/billing-queries")).seedProSubscription;
  });

  // Every test in this block runs with FREE_LIMITS_ENFORCED unset unless it
  // stubs otherwise, so the legacy-free default is what the bare cases assert.
  afterEach(() => {
    vi.unstubAllEnvs();
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

  // The limit is no longer a constant — it comes from the user's entitlements,
  // which read FREE_LIMITS_ENFORCED on every call.
  describe("plan awareness", () => {
    const FREE_MAX = PLAN_LIMITS.free.maxActiveApiKeys;

    it("keeps the legacy 20 for free users while enforcement is off", async () => {
      vi.stubEnv("FREE_LIMITS_ENFORCED", "false");
      await seedUser("u-legacy");
      await seedKeys("u-legacy", MAX_ACTIVE_KEYS - 1);

      await expect(assertKeyQuota("u-legacy")).resolves.toBeUndefined();
    });

    it("refuses a free user at 3 once enforcement is on", async () => {
      vi.stubEnv("FREE_LIMITS_ENFORCED", "true");
      await seedUser("u-free-cap");
      await seedKeys("u-free-cap", FREE_MAX - 1);
      await expect(assertKeyQuota("u-free-cap")).resolves.toBeUndefined();

      await seedKeys("u-free-cap", 1, false, "extra");
      await expect(assertKeyQuota("u-free-cap")).rejects.toThrow(
        `Free accounts can have ${FREE_MAX} active keys. Revoke one or upgrade to Pro.`,
      );
    });

    it("gives a pro subscriber the 20-key ceiling and the neutral message", async () => {
      vi.stubEnv("FREE_LIMITS_ENFORCED", "true");
      await seedUser("u-pro-keys");
      await seedProSubscription("u-pro-keys");
      // Well past the Free limit, still under Pro's.
      await seedKeys("u-pro-keys", MAX_ACTIVE_KEYS - 1);
      await expect(assertKeyQuota("u-pro-keys")).resolves.toBeUndefined();

      await seedKeys("u-pro-keys", 1, false, "extra");
      await expect(assertKeyQuota("u-pro-keys")).rejects.toThrow(
        "Key limit reached. Revoke an unused key first.",
      );
    });

    // Grandfathering: enforcement arriving must not strand or silently revoke
    // keys a user legitimately created under the old limit. It blocks the next
    // create; it never touches what exists.
    it("blocks new keys but leaves a free user's pre-existing extras intact", async () => {
      vi.stubEnv("FREE_LIMITS_ENFORCED", "true");
      await seedUser("u-grandfathered");
      await seedKeys("u-grandfathered", 5);

      await expect(assertKeyQuota("u-grandfathered")).rejects.toThrow(/Free accounts/);

      const rows = await db
        .select()
        .from(apiKey)
        .where(eq(apiKey.userId, "u-grandfathered"));
      expect(rows).toHaveLength(5);
      expect(rows.every((r) => r.revokedAt === null)).toBe(true);
    });
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
