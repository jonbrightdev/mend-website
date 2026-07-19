import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user } from "@/db/schema";
import { stripe } from "@/lib/stripe";
import { isBillingEnabled } from "@/lib/billing-config";

// POST /api/billing/portal → { url } for the hosted Stripe Customer Portal,
// where Pro users cancel, switch monthly↔yearly, and update cards. Same session
// auth as checkout.ts; billing id is Drizzle-loaded, never off the session.
// A user with no Stripe customer yet has nothing to manage → 400.

export const Route = createFileRoute("/api/billing/portal")({
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

        const [row] = await db
          .select({ stripeCustomerId: user.stripeCustomerId })
          .from(user)
          .where(eq(user.id, session.user.id))
          .limit(1);
        if (!row?.stripeCustomerId) {
          return Response.json(
            { error: "No billing account yet." },
            { status: 400 },
          );
        }

        const portal = await stripe.billingPortal.sessions.create({
          customer: row.stripeCustomerId,
          return_url: `${process.env.BETTER_AUTH_URL ?? ""}/account`,
        });

        return Response.json({ url: portal.url });
      },
    },
  },
});
