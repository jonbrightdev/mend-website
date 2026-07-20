import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { subscription, user } from "@/db/schema";

// getUserEntitlements imports "@/db", so it is imported dynamically in
// beforeAll — after createTestDb() seeds the global instance. Mirrors the
// dashboard-queries.test.ts harness pattern.

let db: Awaited<ReturnType<typeof createTestDb>>;
let getUserEntitlements: (userId: string) => Promise<import("@/lib/entitlements").PlanLimits>;
let getBillingSummary: (
  userId: string,
) => Promise<import("@/lib/billing-queries").BillingSummary>;
let seedProSubscription: (userId: string) => Promise<void>;

const ORIGINAL_ENFORCED = process.env.FREE_LIMITS_ENFORCED;
const STRIPE_ENV = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
  STRIPE_PRICE_PRO_YEARLY: process.env.STRIPE_PRICE_PRO_YEARLY,
};

/** isBillingEnabled() needs all three set; the summary's canUpgrade/canManage
 * hang off it, so tests that care must say which world they're in. */
function setBillingEnabled(enabled: boolean) {
  if (enabled) {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_m";
    process.env.STRIPE_PRICE_PRO_YEARLY = "price_y";
  } else {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
  }
}

async function seedUser(id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
}

beforeAll(async () => {
  db = await createTestDb();
  ({ getUserEntitlements, getBillingSummary, seedProSubscription } = await import(
    "@/lib/billing-queries"
  ));
});

afterEach(() => {
  // Restore the env flags so tests don't leak into one another.
  if (ORIGINAL_ENFORCED === undefined) delete process.env.FREE_LIMITS_ENFORCED;
  else process.env.FREE_LIMITS_ENFORCED = ORIGINAL_ENFORCED;
  for (const [k, v] of Object.entries(STRIPE_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
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

describe("getBillingSummary", () => {
  it("reports Free with no subscription row, and offers upgrade", async () => {
    setBillingEnabled(true);
    await seedUser("u_sum_free");
    const s = await getBillingSummary("u_sum_free");
    expect(s.plan).toBe("free");
    expect(s.productPlan).toBe("free");
    expect(s.status).toBeNull();
    expect(s.currentPeriodEnd).toBeNull();
    expect(s.canUpgrade).toBe(true);
    // No Stripe customer yet, so there is nothing for the portal to open.
    expect(s.canManage).toBe(false);
  });

  it("reports Pro with an ISO period end and no upgrade offer", async () => {
    setBillingEnabled(true);
    await seedUser("u_sum_pro");
    await seedProSubscription("u_sum_pro");
    await db
      .update(user)
      .set({ stripeCustomerId: "cus_test" })
      .where(eq(user.id, "u_sum_pro"));

    const s = await getBillingSummary("u_sum_pro");
    expect(s.plan).toBe("pro");
    expect(s.productPlan).toBe("pro");
    expect(s.status).toBe("active");
    expect(s.interval).toBe("month");
    expect(typeof s.currentPeriodEnd).toBe("string");
    // Checkout would 409 ALREADY_SUBSCRIBED, so the button must not appear.
    expect(s.canUpgrade).toBe(false);
    expect(s.canManage).toBe(true);
  });

  it("separates what was bought from what is still granted", async () => {
    setBillingEnabled(true);
    await seedUser("u_sum_lapsed");
    // Canceled and past its period end: bought Pro, entitled to Free.
    await db.insert(subscription).values({
      id: crypto.randomUUID(),
      userId: "u_sum_lapsed",
      stripeSubscriptionId: "sub_test_lapsed",
      stripePriceId: "price_test_pro_monthly",
      plan: "pro",
      status: "canceled",
      currentPeriodStart: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: true,
      interval: "month",
    });

    const s = await getBillingSummary("u_sum_lapsed");
    expect(s.productPlan).toBe("pro");
    expect(s.plan).toBe("free");
    // Back on Free, so they can buy again.
    expect(s.canUpgrade).toBe(true);
  });

  it("offers neither action when Stripe is unconfigured", async () => {
    setBillingEnabled(false);
    await seedUser("u_sum_nostripe");
    await db
      .update(user)
      .set({ stripeCustomerId: "cus_test_2" })
      .where(eq(user.id, "u_sum_nostripe"));

    const s = await getBillingSummary("u_sum_nostripe");
    expect(s.billingEnabled).toBe(false);
    expect(s.canUpgrade).toBe(false);
    // A customer id exists, but the portal route would 503 — don't offer it.
    expect(s.canManage).toBe(false);
  });

  it("mirrors the free-limits flag so the UI can describe the plan", async () => {
    setBillingEnabled(true);
    await seedUser("u_sum_flag");
    process.env.FREE_LIMITS_ENFORCED = "true";
    expect((await getBillingSummary("u_sum_flag")).freeLimitsEnforced).toBe(true);
    delete process.env.FREE_LIMITS_ENFORCED;
    expect((await getBillingSummary("u_sum_flag")).freeLimitsEnforced).toBe(false);
  });
});
