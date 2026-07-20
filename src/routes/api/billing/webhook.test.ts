import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { stripeEvent, subscription, user } from "@/db/schema";

// Covers the HTTP boundary of POST /api/billing/webhook: signature
// verification, the idempotency fast path, mid-fail retry (no stripe_event
// row survives a failed apply), double delivery, and that the invoice path
// retrieves the subscription before any DB transaction opens. Pure/tx-level
// scenarios (stale-id guard, resubscribe, period derivation) live in
// src/lib/billing-webhooks.test.ts — this file exercises the route wiring
// around them, not the logic itself.

const constructEvent = vi.fn();
const subscriptionsRetrieve = vi.fn();
const customersRetrieve = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent },
    subscriptions: { retrieve: subscriptionsRetrieve },
    customers: { retrieve: customersRetrieve },
  },
}));

type Handler = (ctx: { request: Request }) => Promise<Response>;

let db: Awaited<ReturnType<typeof createTestDb>>;
let post: Handler;

function req(body = "{}"): Request {
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body,
  });
}

/** Basil+-shaped Subscription fixture: periods on items.data[0]. */
function makeSub(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { userId: "u1" },
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

function makeEvent(id: string, type: string, object: unknown): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

describe("POST /api/billing/webhook", () => {
  beforeAll(async () => {
    db = await createTestDb();
    const mod = await import("@/routes/api/billing/webhook");
    post = (mod.Route as unknown as {
      options: { server: { handlers: { POST: Handler } } };
    }).options.server.handlers.POST;
  });

  beforeEach(async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_month");
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "price_year");
    constructEvent.mockReset();
    subscriptionsRetrieve.mockReset();
    customersRetrieve.mockReset();
    await db.insert(user).values({ id: "u1", name: "User u1", email: "u1@example.com" });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.delete(subscription);
    await db.delete(stripeEvent);
    await db.delete(user);
  });

  it("returns 400 when signature verification fails", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("no match");
    });
    const res = await post({ request: req() });
    expect(res.status).toBe(400);
  });

  it("applies customer.subscription.updated and records the event", async () => {
    const event = makeEvent("evt_ok", "customer.subscription.updated", makeSub());
    constructEvent.mockReturnValue(event);

    const res = await post({ request: req() });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(subscription).where(eq(subscription.userId, "u1"));
    expect(row).toMatchObject({ stripeSubscriptionId: "sub_1", status: "active" });

    const [evt] = await db.select().from(stripeEvent).where(eq(stripeEvent.id, "evt_ok"));
    expect(evt).toMatchObject({ type: "customer.subscription.updated" });
  });

  it("mid-fail retry: a failed apply leaves no stripe_event row, and retry succeeds", async () => {
    // First delivery: the subscription's only item has no price, so
    // upsertFromStripeSubscription throws inside the transaction.
    const badSub = makeSub({
      items: {
        object: "list",
        data: [
          {
            id: "si_1",
            object: "subscription_item",
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_592_000,
            price: undefined,
          } as unknown as Stripe.SubscriptionItem,
        ],
        has_more: false,
        url: "/v1/subscription_items",
      },
    });
    const event = makeEvent("evt_retry", "customer.subscription.updated", badSub);
    constructEvent.mockReturnValue(event);

    const firstRes = await post({ request: req() });
    expect(firstRes.status).toBe(500);

    const rowsAfterFailure = await db.select().from(stripeEvent).where(eq(stripeEvent.id, "evt_retry"));
    expect(rowsAfterFailure).toHaveLength(0);
    const subAfterFailure = await db.select().from(subscription).where(eq(subscription.userId, "u1"));
    expect(subAfterFailure).toHaveLength(0);

    // Stripe retries the same event id; this time the payload is well-formed.
    const goodEvent = makeEvent("evt_retry", "customer.subscription.updated", makeSub());
    constructEvent.mockReturnValue(goodEvent);

    const secondRes = await post({ request: req() });
    expect(secondRes.status).toBe(200);

    const [evt] = await db.select().from(stripeEvent).where(eq(stripeEvent.id, "evt_retry"));
    expect(evt).toBeDefined();
    const [row] = await db.select().from(subscription).where(eq(subscription.userId, "u1"));
    expect(row).toMatchObject({ stripeSubscriptionId: "sub_1", status: "active" });
  });

  it("double delivery: second call returns 200 and skips the Stripe retrieve", async () => {
    const invoice = {
      id: "in_1",
      object: "invoice",
      parent: { subscription_details: { subscription: "sub_dbl" }, quote_details: null, type: "subscription_details" },
    };
    const event = makeEvent("evt_dbl", "invoice.paid", invoice);
    constructEvent.mockReturnValue(event);
    subscriptionsRetrieve.mockResolvedValue(makeSub({ id: "sub_dbl" }));

    const first = await post({ request: req() });
    expect(first.status).toBe(200);
    expect(subscriptionsRetrieve).toHaveBeenCalledTimes(1);

    const rowsAfterFirst = await db.select().from(subscription).where(eq(subscription.userId, "u1"));

    const second = await post({ request: req() });
    expect(second.status).toBe(200);
    // Fast path (stripe_event pre-check) skips the network entirely on redelivery.
    expect(subscriptionsRetrieve).toHaveBeenCalledTimes(1);

    const rowsAfterSecond = await db.select().from(subscription).where(eq(subscription.userId, "u1"));
    expect(rowsAfterSecond).toEqual(rowsAfterFirst);
  });

  it("invoice path retrieves the subscription before the DB transaction opens", async () => {
    const invoice = {
      id: "in_2",
      object: "invoice",
      parent: { subscription_details: { subscription: "sub_order" }, quote_details: null, type: "subscription_details" },
    };
    const event = makeEvent("evt_order", "invoice.payment_failed", invoice);
    constructEvent.mockReturnValue(event);

    const order: string[] = [];
    subscriptionsRetrieve.mockImplementation(async () => {
      order.push("stripe-retrieve");
      return makeSub({ id: "sub_order", status: "past_due" });
    });

    const originalTransaction = db.transaction.bind(db);
    const txSpy = vi
      .spyOn(db, "transaction")
      // biome-ignore lint/suspicious/noExplicitAny: mirrors drizzle's own overloaded transaction signature.
      .mockImplementation(((cb: any) => {
        order.push("tx-open");
        return originalTransaction(cb);
        // biome-ignore lint/suspicious/noExplicitAny: see above.
      }) as any);

    try {
      const res = await post({ request: req() });
      expect(res.status).toBe(200);
      expect(order).toEqual(["stripe-retrieve", "tx-open"]);
    } finally {
      txSpy.mockRestore();
    }
  });

  it("stale deleted for sub_old: 200, mirror unchanged, event row retained", async () => {
    // Mirror currently shows sub_new active…
    constructEvent.mockReturnValue(
      makeEvent("evt_new", "customer.subscription.updated", makeSub({ id: "sub_new" })),
    );
    expect((await post({ request: req() })).status).toBe(200);

    // …then a late deleted event for the previous subscription id arrives.
    constructEvent.mockReturnValue(
      makeEvent(
        "evt_stale",
        "customer.subscription.deleted",
        makeSub({ id: "sub_old", status: "canceled" }),
      ),
    );
    const res = await post({ request: req() });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(subscription).where(eq(subscription.userId, "u1"));
    expect(row).toMatchObject({ stripeSubscriptionId: "sub_new", status: "active" });

    // The event row is still recorded so Stripe redelivery hits the fast path.
    const [evt] = await db.select().from(stripeEvent).where(eq(stripeEvent.id, "evt_stale"));
    expect(evt).toBeDefined();
  });

  it("returns 200 without writing an event row for an event type it doesn't mirror", async () => {
    const event = makeEvent("evt_irrelevant", "charge.succeeded", { id: "ch_1" });
    constructEvent.mockReturnValue(event);

    const res = await post({ request: req() });
    expect(res.status).toBe(200);

    const rows = await db.select().from(stripeEvent).where(eq(stripeEvent.id, "evt_irrelevant"));
    expect(rows).toHaveLength(0);
  });

  it("returns 200 and logs when the userId can never resolve (e.g. deleted account)", async () => {
    const sub = makeSub({ metadata: {}, customer: "cus_unknown" });
    customersRetrieve.mockResolvedValue({ id: "cus_unknown", deleted: false, metadata: {} });
    const event = makeEvent("evt_gone", "customer.subscription.updated", sub);
    constructEvent.mockReturnValue(event);

    const res = await post({ request: req() });
    expect(res.status).toBe(200);

    const rows = await db.select().from(stripeEvent).where(eq(stripeEvent.id, "evt_gone"));
    expect(rows).toHaveLength(0);
  });
});
