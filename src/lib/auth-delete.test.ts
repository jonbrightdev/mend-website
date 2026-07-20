import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { user } from "@/db/schema";

// Covers cleanupStripeBeforeDelete, the fail-closed Stripe cleanup wired into
// user.deleteUser.beforeDelete in src/lib/auth.ts (see
// plans/pricing-stripe-design.md §Account delete). @/lib/auth pulls in @/db
// (via drizzleAdapter) and @/lib/stripe, so both are dynamically imported in
// beforeAll, after createTestDb() has put the in-memory instance on
// globalThis for "@/db" to pick up — same pattern as auth-verification.test.ts.

const subscriptionsList = vi.fn();
const subscriptionsCancel = vi.fn();
const customersDel = vi.fn();

vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    subscriptions: { list: subscriptionsList, cancel: subscriptionsCancel },
    customers: { del: customersDel },
  },
}));

let db: Awaited<ReturnType<typeof createTestDb>>;
let cleanupStripeBeforeDelete: (typeof import("@/lib/auth"))["cleanupStripeBeforeDelete"];

describe("cleanupStripeBeforeDelete", () => {
  beforeAll(async () => {
    db = await createTestDb();
    ({ cleanupStripeBeforeDelete } = await import("@/lib/auth"));
  });

  beforeEach(() => {
    subscriptionsList.mockReset();
    subscriptionsCancel.mockReset();
    customersDel.mockReset();
    subscriptionsList.mockResolvedValue({ data: [] });
    customersDel.mockResolvedValue({ id: "cus_deleted", deleted: true });
  });

  async function makeUser(id: string, stripeCustomerId: string | null = null) {
    await db.insert(user).values({
      id,
      name: `User ${id}`,
      email: `${id}@example.com`,
      stripeCustomerId,
    });
  }

  it("resolves without calling Stripe when the user has no stripeCustomerId", async () => {
    await makeUser("free-1");
    await expect(cleanupStripeBeforeDelete({ id: "free-1" })).resolves.toBeUndefined();
    expect(subscriptionsList).not.toHaveBeenCalled();
    expect(subscriptionsCancel).not.toHaveBeenCalled();
    expect(customersDel).not.toHaveBeenCalled();
  });

  it("cancels every cancelable subscription and deletes the customer", async () => {
    await makeUser("pro-1", "cus_pro1");
    subscriptionsList.mockResolvedValue({
      data: [
        { id: "sub_active", status: "active" },
        { id: "sub_trialing", status: "trialing" },
        { id: "sub_already_canceled", status: "canceled" },
      ],
    });

    await cleanupStripeBeforeDelete({ id: "pro-1" });

    expect(subscriptionsList).toHaveBeenCalledWith({ customer: "cus_pro1", status: "all" });
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_active");
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_trialing");
    expect(subscriptionsCancel).not.toHaveBeenCalledWith("sub_already_canceled");
    expect(customersDel).toHaveBeenCalledWith("cus_pro1");
  });

  it("fails closed: throws and does not delete the customer when Stripe errors", async () => {
    await makeUser("pro-2", "cus_pro2");
    subscriptionsList.mockRejectedValue(new Error("stripe is down"));

    await expect(cleanupStripeBeforeDelete({ id: "pro-2" })).rejects.toThrow(
      /Could not cancel your subscription/,
    );
    expect(customersDel).not.toHaveBeenCalled();
  });

  it("fails closed when cancel succeeds but customer deletion errors", async () => {
    await makeUser("pro-3", "cus_pro3");
    subscriptionsList.mockResolvedValue({ data: [{ id: "sub_x", status: "active" }] });
    customersDel.mockRejectedValue(new Error("stripe is down"));

    await expect(cleanupStripeBeforeDelete({ id: "pro-3" })).rejects.toThrow(
      /Could not cancel your subscription/,
    );
    expect(subscriptionsCancel).toHaveBeenCalledWith("sub_x");
  });
});
