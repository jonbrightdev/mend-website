import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { subscription, user } from "@/db/schema";
import { stripe } from "@/lib/stripe";
import {
  isBillingEnabled,
  parseCheckoutPrice,
  priceIdFor,
} from "@/lib/billing-config";
import { effectivePlan } from "@/lib/entitlements";
import type { PlanId, SubscriptionStatus } from "@/lib/entitlements";

// POST /api/billing/checkout → { url } for hosted Stripe Checkout.
//
// Session-cookie auth only (same-origin browser action from the account/pricing
// page), mirroring src/routes/api/export.ts — no Authorization fallback, no CORS.
// Billing fields are NOT on the session, so we always Drizzle-load
// stripeCustomerId. The client sends only a plan key ("pro_monthly" |
// "pro_yearly"); the raw Stripe price id is resolved server-side from env.

/** Resolves-or-creates the user's Stripe customer id without racing a parallel
 * request. The create is unconditional, but the write only wins if the column
 * is still null; a losing writer re-reads and keeps the DB winner, leaving its
 * own freshly-created customer orphaned (logged for manual cleanup). */
async function ensureCustomerId(row: {
  id: string;
  email: string;
  name: string;
  stripeCustomerId: string | null;
}): Promise<string> {
  if (row.stripeCustomerId) return row.stripeCustomerId;

  const customer = await stripe.customers.create({
    email: row.email,
    name: row.name,
    metadata: { userId: row.id },
  });

  const updated = await db
    .update(user)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(user.id, row.id), isNull(user.stripeCustomerId)))
    .returning();

  if (updated.length > 0 && updated[0]!.stripeCustomerId) {
    return updated[0]!.stripeCustomerId;
  }

  // A concurrent request won the write. Prefer the DB winner and abandon the
  // customer we just created rather than overwrite a non-null value.
  const [current] = await db
    .select({ stripeCustomerId: user.stripeCustomerId })
    .from(user)
    .where(eq(user.id, row.id))
    .limit(1);
  if (current?.stripeCustomerId) {
    console.warn(
      `checkout: orphaned Stripe customer ${customer.id} for user ${row.id}; DB kept ${current.stripeCustomerId}`,
    );
    return current.stripeCustomerId;
  }
  // Should not happen (we just created one), but never return an empty id.
  return customer.id;
}

/** True when the user's mirrored subscription still grants Pro access. */
async function hasEntitlingPro(userId: string): Promise<boolean> {
  const [sub] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);
  if (!sub) return false;
  return (
    effectivePlan({
      productPlan: sub.plan as PlanId,
      status: sub.status as SubscriptionStatus,
      currentPeriodEnd: sub.currentPeriodEnd,
    }) === "pro"
  );
}

export const Route = createFileRoute("/api/billing/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isBillingEnabled()) {
          return Response.json(
            { error: "Billing is not configured." },
            { status: 503 },
          );
        }

        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const userId = session.user.id;

        const [row] = await db
          .select({
            id: user.id,
            email: user.email,
            name: user.name,
            stripeCustomerId: user.stripeCustomerId,
          })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);
        if (!row) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (await hasEntitlingPro(userId)) {
          return Response.json(
            {
              error: "You already have an active Pro subscription.",
              code: "ALREADY_SUBSCRIBED",
            },
            { status: 409 },
          );
        }

        let priceKey: ReturnType<typeof parseCheckoutPrice>;
        try {
          priceKey = parseCheckoutPrice(await request.json().catch(() => null));
        } catch {
          return Response.json({ error: "Invalid price" }, { status: 400 });
        }

        const customerId = await ensureCustomerId(row);
        const baseUrl = process.env.BETTER_AUTH_URL ?? "";

        const checkout = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: customerId,
          line_items: [{ price: priceIdFor(priceKey), quantity: 1 }],
          success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/billing/cancel`,
          client_reference_id: userId,
          subscription_data: { metadata: { userId } },
          allow_promotion_codes: true,
        });

        return Response.json({ url: checkout.url });
      },
    },
  },
});
