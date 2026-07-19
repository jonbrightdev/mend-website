import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { user } from "@/db/schema";

// Covers POST /api/billing/portal: session guard, the no-customer 400, and the
// happy path returning a portal url with a /account return_url. Stripe SDK and
// session mocked.

const getSession = vi.fn();
const portalCreate = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/stripe", () => ({
  stripe: { billingPortal: { sessions: { create: portalCreate } } },
}));

type Handler = (ctx: { request: Request }) => Promise<Response>;

let db: Awaited<ReturnType<typeof createTestDb>>;
let post: Handler;

function req(): Request {
  return new Request("http://localhost/api/billing/portal", { method: "POST" });
}

async function makeUser(id: string, stripeCustomerId: string | null = null) {
  await db.insert(user).values({
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    stripeCustomerId,
  });
}

describe("POST /api/billing/portal", () => {
  beforeAll(async () => {
    db = await createTestDb();
    const mod = await import("@/routes/api/billing/portal");
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
    portalCreate.mockReset();
    portalCreate.mockResolvedValue({ url: "https://portal.stripe.test/s" });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await db.delete(user);
  });

  it("returns 401 with no session", async () => {
    getSession.mockResolvedValue(null);
    const res = await post({ request: req() });
    expect(res.status).toBe(401);
  });

  it("returns 400 when the user has no Stripe customer id", async () => {
    await makeUser("p1");
    getSession.mockResolvedValue({ user: { id: "p1" } });
    const res = await post({ request: req() });
    expect(res.status).toBe(400);
    expect(portalCreate).not.toHaveBeenCalled();
  });

  it("returns a portal url with an /account return_url", async () => {
    await makeUser("p2", "cus_p2");
    getSession.mockResolvedValue({ user: { id: "p2" } });
    const res = await post({ request: req() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://portal.stripe.test/s" });
    const args = portalCreate.mock.calls[0]![0];
    expect(args.customer).toBe("cus_p2");
    expect(args.return_url).toMatch(/\/account$/);
  });
});
