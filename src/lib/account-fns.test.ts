import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { apiKey, user } from "@/db/schema";

// Covers the per-user active-key quota. account-fns imports "@/db", so it is
// imported dynamically in beforeAll — after createTestDb() has put the
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
    const mod = await import("@/lib/account-fns");
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
