import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { user } from "@/db/schema";

// Covers POST /api/billing/checkout: billing gate, session guard, race-safe
// customer create, already-subscribed conflict, and the Checkout args. The
// Stripe SDK and the session are mocked — no network, no real cookie.

const getSession = vi.fn();
const customersCreate = vi.fn();
const checkoutCreate = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    customers: { create: customersCreate },
    checkout: { sessions: { create: checkoutCreate } },
  },
}));

type Handler = (ctx: { request: Request }) => Promise<Response>;

let db: Awaited<ReturnType<typeof createTestDb>>;
let post: Handler;
// Imports "@/db", so it is loaded dynamically in beforeAll — after
// createTestDb() binds the in-memory instance to globalThis.
let seedProSubscription: (userId: string) => Promise<void>;

function req(body?: unknown): Request {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function makeUser(id: string, stripeCustomerId: string | null = null) {
  await db.insert(user).values({
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    stripeCustomerId,
  });
}

describe("POST /api/billing/checkout", () => {
  beforeAll(async () => {
    db = await createTestDb();
    ({ seedProSubscription } = await import("@/lib/billing-queries"));
    const mod = await import("@/routes/api/billing/checkout");
    post = (mod.Route as unknown as {
      options: { server: { handlers: { POST: Handler } } };
    }).options.server.handlers.POST;
  });

  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test");
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_month");
    vi.stubEnv("STRIPE_PRICE_PRO_YEARLY", "price_year");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    getSession.mockReset();
    customersCreate.mockReset();
    checkoutCreate.mockReset();
    checkoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/s" });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.delete(user);
  });

  it("returns 503 when billing is not configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const res = await post({ request: req({ price: "pro_monthly" }) });
    expect(res.status).toBe(503);
  });

  it("returns 401 with no session", async () => {
    getSession.mockResolvedValue(null);
    const res = await post({ request: req({ price: "pro_monthly" }) });
    expect(res.status).toBe(401);
  });

  it("creates a customer when none exists and writes the id", async () => {
    await makeUser("u1");
    getSession.mockResolvedValue({ user: { id: "u1" } });
    customersCreate.mockResolvedValue({ id: "cus_new" });

    const res = await post({ request: req({ price: "pro_monthly" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.test/s" });

    expect(customersCreate).toHaveBeenCalledWith({
      email: "u1@example.com",
      name: "User u1",
      metadata: { userId: "u1" },
    });
    const [row] = await db
      .select({ cid: user.stripeCustomerId })
      .from(user)
      .where(eq(user.id, "u1"));
    expect(row!.cid).toBe("cus_new");
    expect(checkoutCreate.mock.calls[0]![0].customer).toBe("cus_new");
  });

  it("reuses an existing customer id without creating another", async () => {
    await makeUser("u2", "cus_existing");
    getSession.mockResolvedValue({ user: { id: "u2" } });

    const res = await post({ request: req({ price: "pro_yearly" }) });
    expect(res.status).toBe(200);
    expect(customersCreate).not.toHaveBeenCalled();
    expect(checkoutCreate.mock.calls[0]![0].customer).toBe("cus_existing");
  });

  it("maps pro_monthly / pro_yearly to the env price id and sets promo codes", async () => {
    await makeUser("u3", "cus_3");
    getSession.mockResolvedValue({ user: { id: "u3" } });

    await post({ request: req({ price: "pro_monthly" }) });
    let args = checkoutCreate.mock.calls[0]![0];
    expect(args.line_items).toEqual([{ price: "price_month", quantity: 1 }]);
    expect(args.mode).toBe("subscription");
    expect(args.allow_promotion_codes).toBe(true);
    expect(args.client_reference_id).toBe("u3");
    expect(args.subscription_data).toEqual({ metadata: { userId: "u3" } });

    checkoutCreate.mockClear();
    await post({ request: req({ price: "pro_yearly" }) });
    args = checkoutCreate.mock.calls[0]![0];
    expect(args.line_items).toEqual([{ price: "price_year", quantity: 1 }]);
  });

  it("returns 400 on an invalid price key", async () => {
    await makeUser("u4", "cus_4");
    getSession.mockResolvedValue({ user: { id: "u4" } });
    const res = await post({ request: req({ price: "enterprise" }) });
    expect(res.status).toBe(400);
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("returns 409 ALREADY_SUBSCRIBED when a Pro subscription is active", async () => {
    await makeUser("u5", "cus_5");
    await seedProSubscription("u5");
    getSession.mockResolvedValue({ user: { id: "u5" } });

    const res = await post({ request: req({ price: "pro_monthly" }) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "ALREADY_SUBSCRIBED" });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });
});
