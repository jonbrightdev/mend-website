import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { subscription, user } from "@/db/schema";

// Covers the pure/tx-level layer of the webhook pipeline: period/plan
// derivation, the stale-id guard, the transactional upsert itself, and
// userId resolution. HTTP-boundary scenarios (signature failure, mid-fail
// retry, double delivery, invoice call-order) live in
// src/routes/api/billing/webhook.test.ts.
//
// Fixtures are basil+-shaped: periods live on items.data[0], never at the
// subscription level.

const customersRetrieve = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: { customers: { retrieve: customersRetrieve } },
}));

let db: Awaited<ReturnType<typeof createTestDb>>;
let periodFromSubscription: (typeof import("@/lib/billing-webhooks"))["periodFromSubscription"];
let planFromPriceId: (typeof import("@/lib/billing-webhooks"))["planFromPriceId"];
let intervalFromPriceId: (typeof import("@/lib/billing-webhooks"))["intervalFromPriceId"];
let shouldApplySubscriptionMirror: (typeof import("@/lib/billing-webhooks"))["shouldApplySubscriptionMirror"];
let upsertFromStripeSubscription: (typeof import("@/lib/billing-webhooks"))["upsertFromStripeSubscription"];
let resolveUserId: (typeof import("@/lib/billing-webhooks"))["resolveUserId"];
let isUniqueViolation: (typeof import("@/lib/billing-webhooks"))["isUniqueViolation"];

beforeAll(async () => {
  db = await createTestDb();
  ({
    periodFromSubscription,
    planFromPriceId,
    intervalFromPriceId,
    shouldApplySubscriptionMirror,
    upsertFromStripeSubscription,
    resolveUserId,
    isUniqueViolation,
  } = await import("@/lib/billing-webhooks"));
});

beforeEach(() => {
  vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_month");
  vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "price_year");
  customersRetrieve.mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await db.delete(subscription);
  await db.delete(user);
});

/** Basil+-shaped Subscription fixture: periods on items.data[0], not on the
 * subscription itself. */
function makeSub(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: {},
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: { id: "price_month" },
        } as unknown as Stripe.SubscriptionItem,
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe("periodFromSubscription", () => {
  it("reads period fields from the first SubscriptionItem", () => {
    const sub = makeSub();
    expect(periodFromSubscription(sub)).toEqual({
      start: new Date(1_700_000_000 * 1000),
      end: new Date(1_702_592_000 * 1000),
    });
  });

  it("throws when the item is missing period fields", () => {
    const sub = makeSub({
      items: {
        object: "list",
        data: [{ id: "si_1", object: "subscription_item" } as unknown as Stripe.SubscriptionItem],
        has_more: false,
        url: "/v1/subscription_items",
      },
    });
    expect(() => periodFromSubscription(sub)).toThrow(/missing item period fields/);
  });

  it("throws when there are no items at all", () => {
    const sub = makeSub({
      items: { object: "list", data: [], has_more: false, url: "/v1/subscription_items" },
    });
    expect(() => periodFromSubscription(sub)).toThrow(/missing item period fields/);
  });
});

describe("planFromPriceId / intervalFromPriceId", () => {
  it("maps the monthly and yearly env price ids to pro", () => {
    expect(planFromPriceId("price_month")).toBe("pro");
    expect(planFromPriceId("price_year")).toBe("pro");
    expect(intervalFromPriceId("price_month")).toBe("month");
    expect(intervalFromPriceId("price_year")).toBe("year");
  });

  it("defaults an unrecognized price id to free / null interval", () => {
    expect(planFromPriceId("price_unknown")).toBe("free");
    expect(intervalFromPriceId("price_unknown")).toBeNull();
  });
});

describe("shouldApplySubscriptionMirror", () => {
  it("accepts when there is no existing mirror row", () => {
    expect(shouldApplySubscriptionMirror(null, { id: "sub_new", status: "active" })).toBe(true);
  });

  it("accepts any status for the same subscription id (normal updates/deletes)", () => {
    const existing = { stripeSubscriptionId: "sub_a", status: "active" };
    expect(shouldApplySubscriptionMirror(existing, { id: "sub_a", status: "canceled" })).toBe(true);
  });

  it("accepts a different id when the incoming status is entitling (resubscribe)", () => {
    const existing = { stripeSubscriptionId: "sub_old", status: "canceled" };
    for (const status of ["active", "trialing", "past_due"]) {
      expect(shouldApplySubscriptionMirror(existing, { id: "sub_new", status })).toBe(true);
    }
  });

  it("rejects a different id with a non-entitling status (stale deleted/updated)", () => {
    const existing = { stripeSubscriptionId: "sub_new", status: "active" };
    for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
      expect(shouldApplySubscriptionMirror(existing, { id: "sub_old", status })).toBe(false);
    }
  });
});

describe("upsertFromStripeSubscription", () => {
  async function makeUser(id: string) {
    await db.insert(user).values({ id, name: `User ${id}`, email: `${id}@example.com` });
  }

  it("inserts a new mirror row when the user has none", async () => {
    await makeUser("u1");
    const result = await db.transaction((tx) =>
      upsertFromStripeSubscription(tx, "u1", makeSub({ id: "sub_1" })),
    );
    expect(result).toBe("applied");

    const [row] = await db.select().from(subscription).where(eq(subscription.userId, "u1"));
    expect(row).toMatchObject({
      stripeSubscriptionId: "sub_1",
      stripePriceId: "price_month",
      plan: "pro",
      status: "active",
      interval: "month",
    });
  });

  it("updates the existing row in place for the same subscription id", async () => {
    await makeUser("u2");
    await db.transaction((tx) => upsertFromStripeSubscription(tx, "u2", makeSub({ id: "sub_2" })));

    await db.transaction((tx) =>
      upsertFromStripeSubscription(
        tx,
        "u2",
        makeSub({ id: "sub_2", status: "past_due", cancel_at_period_end: true }),
      ),
    );

    const rows = await db.select().from(subscription).where(eq(subscription.userId, "u2"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stripeSubscriptionId: "sub_2", status: "past_due", cancelAtPeriodEnd: true });
  });

  it("cancel then resubscribe: overwrites stripeSubscriptionId with the new active sub", async () => {
    await makeUser("u3");
    await db.transaction((tx) => upsertFromStripeSubscription(tx, "u3", makeSub({ id: "sub_old" })));
    await db.transaction((tx) =>
      upsertFromStripeSubscription(tx, "u3", makeSub({ id: "sub_old", status: "canceled" })),
    );

    const result = await db.transaction((tx) =>
      upsertFromStripeSubscription(tx, "u3", makeSub({ id: "sub_new", status: "active" })),
    );
    expect(result).toBe("applied");

    const rows = await db.select().from(subscription).where(eq(subscription.userId, "u3"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stripeSubscriptionId: "sub_new", status: "active" });
  });

  it("stale deleted for sub_old while mirror is sub_new: mirror unchanged", async () => {
    await makeUser("u4");
    await db.transaction((tx) => upsertFromStripeSubscription(tx, "u4", makeSub({ id: "sub_old" })));
    await db.transaction((tx) =>
      upsertFromStripeSubscription(tx, "u4", makeSub({ id: "sub_new", status: "active" })),
    );

    const result = await db.transaction((tx) =>
      upsertFromStripeSubscription(tx, "u4", makeSub({ id: "sub_old", status: "canceled" })),
    );
    expect(result).toBe("ignored_stale");

    const rows = await db.select().from(subscription).where(eq(subscription.userId, "u4"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stripeSubscriptionId: "sub_new", status: "active" });
  });

  it("non-entitling updated for sub_old while mirror is sub_new: no-op", async () => {
    await makeUser("u5");
    await db.transaction((tx) => upsertFromStripeSubscription(tx, "u5", makeSub({ id: "sub_old" })));
    await db.transaction((tx) =>
      upsertFromStripeSubscription(tx, "u5", makeSub({ id: "sub_new", status: "active" })),
    );

    const result = await db.transaction((tx) =>
      upsertFromStripeSubscription(tx, "u5", makeSub({ id: "sub_old", status: "unpaid" })),
    );
    expect(result).toBe("ignored_stale");
  });

  it("throws (rolls back) when the subscription has no price on its first item", async () => {
    await makeUser("u6");
    const sub = makeSub({
      id: "sub_6",
      items: {
        object: "list",
        data: [
          {
            id: "si_1",
            object: "subscription_item",
            current_period_start: 1,
            current_period_end: 2,
            price: undefined,
          } as unknown as Stripe.SubscriptionItem,
        ],
        has_more: false,
        url: "/v1/subscription_items",
      },
    });

    await expect(
      db.transaction((tx) => upsertFromStripeSubscription(tx, "u6", sub)),
    ).rejects.toThrow(/has no price/);

    const rows = await db.select().from(subscription).where(eq(subscription.userId, "u6"));
    expect(rows).toHaveLength(0);
  });
});

describe("resolveUserId", () => {
  async function makeUser(id: string, stripeCustomerId: string) {
    await db.insert(user).values({ id, name: `User ${id}`, email: `${id}@example.com`, stripeCustomerId });
  }

  it("prefers subscription.metadata.userId, without calling Stripe", async () => {
    const sub = makeSub({ metadata: { userId: "u-meta" } });
    const result = await resolveUserId(sub);
    expect(result).toBe("u-meta");
    expect(customersRetrieve).not.toHaveBeenCalled();
  });

  it("falls back to customer.metadata.userId", async () => {
    customersRetrieve.mockResolvedValue({ id: "cus_1", deleted: false, metadata: { userId: "u-cust" } });
    const sub = makeSub({ metadata: {}, customer: "cus_1" });
    const result = await resolveUserId(sub);
    expect(result).toBe("u-cust");
    expect(customersRetrieve).toHaveBeenCalledWith("cus_1");
  });

  it("falls back to a DB lookup by stripeCustomerId", async () => {
    await makeUser("u-db", "cus_2");
    customersRetrieve.mockResolvedValue({ id: "cus_2", deleted: false, metadata: {} });
    const sub = makeSub({ metadata: {}, customer: "cus_2" });
    const result = await resolveUserId(sub);
    expect(result).toBe("u-db");
  });

  it("returns null when nothing resolves (event can never apply)", async () => {
    customersRetrieve.mockResolvedValue({ id: "cus_gone", deleted: false, metadata: {} });
    const sub = makeSub({ metadata: {}, customer: "cus_gone" });
    const result = await resolveUserId(sub);
    expect(result).toBeNull();
  });

  it("treats a deleted customer as having no metadata", async () => {
    customersRetrieve.mockResolvedValue({ id: "cus_deleted", deleted: true });
    const sub = makeSub({ metadata: {}, customer: "cus_deleted" });
    const result = await resolveUserId(sub);
    expect(result).toBeNull();
  });
});

describe("isUniqueViolation", () => {
  it("recognizes a Postgres 23505 wrapped in DrizzleQueryError's cause", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
  });

  it("returns false for other shapes", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
  });
});
