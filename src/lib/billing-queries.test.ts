import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { subscription, user } from "@/db/schema";

// getUserEntitlements imports "@/db", so it is imported dynamically in
// beforeAll — after createTestDb() seeds the global instance. Mirrors the
// dashboard-queries.test.ts harness pattern.

let db: Awaited<ReturnType<typeof createTestDb>>;
let getUserEntitlements: (userId: string) => Promise<import("@/lib/entitlements").PlanLimits>;
let seedProSubscription: (userId: string) => Promise<void>;

const ORIGINAL_ENFORCED = process.env.FREE_LIMITS_ENFORCED;

async function seedUser(id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
}

beforeAll(async () => {
  db = await createTestDb();
  ({ getUserEntitlements, seedProSubscription } = await import("@/lib/billing-queries"));
});

afterEach(() => {
  // Restore the env flag so tests don't leak into one another.
  if (ORIGINAL_ENFORCED === undefined) delete process.env.FREE_LIMITS_ENFORCED;
  else process.env.FREE_LIMITS_ENFORCED = ORIGINAL_ENFORCED;
});

describe("getUserEntitlements", () => {
  it("returns legacy free limits (20 keys, ∞ audits) with no row and enforcement off", async () => {
    delete process.env.FREE_LIMITS_ENFORCED;
    await seedUser("u_legacy");
    const limits = await getUserEntitlements("u_legacy");
    expect(limits.plan).toBe("free");
    expect(limits.maxActiveApiKeys).toBe(20);
    expect(limits.maxStoredAudits).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns enforced free limits (3 keys, 200 audits, 30d) with no row and enforcement on", async () => {
    process.env.FREE_LIMITS_ENFORCED = "true";
    await seedUser("u_free_enforced");
    const limits = await getUserEntitlements("u_free_enforced");
    expect(limits.plan).toBe("free");
    expect(limits.maxActiveApiKeys).toBe(3);
    expect(limits.maxStoredAudits).toBe(200);
    expect(limits.auditRetentionDays).toBe(30);
  });

  it("returns pro limits after seedProSubscription even when free limits are enforced", async () => {
    process.env.FREE_LIMITS_ENFORCED = "true";
    await seedUser("u_pro");
    await seedProSubscription("u_pro");
    const limits = await getUserEntitlements("u_pro");
    expect(limits.plan).toBe("pro");
    expect(limits.ingestPerMinute).toBe(300);
    expect(limits.maxActiveApiKeys).toBe(20);
    expect(limits.maxStoredAudits).toBe(50_000);
    expect(limits.auditRetentionDays).toBe(730);
  });

  it("falls back to free for a past_due row with a null period end (safe fail)", async () => {
    delete process.env.FREE_LIMITS_ENFORCED;
    await seedUser("u_past_due");
    await db.insert(subscription).values({
      id: crypto.randomUUID(),
      userId: "u_past_due",
      stripeSubscriptionId: "sub_test_past_due",
      stripePriceId: "price_test_pro_monthly",
      plan: "pro",
      status: "past_due",
      currentPeriodStart: new Date(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      interval: "month",
    });
    const limits = await getUserEntitlements("u_past_due");
    expect(limits.plan).toBe("free");
  });
});
