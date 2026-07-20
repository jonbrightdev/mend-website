import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stripeEvent } from "@/db/schema";
import { stripe } from "@/lib/stripe";
import {
  isDuplicateEventInsert,
  prepareSubscriptionMirror,
  upsertFromStripeSubscription,
} from "@/lib/billing-webhooks";

// POST /api/billing/webhook — Stripe's only trusted path for mirroring
// subscription status/period into Postgres. No session auth, no CORS: Stripe
// signs the payload instead, verified below against the RAW body (never
// `request.json()` first — that would consume the body before verification).
//
// Pipeline (plans/pricing-stripe-design.md §Webhooks):
//   verify signature → stripe_event pre-check (skip re-processing on
//   redelivery) → ALL Stripe HTTP retrieves + userId resolution
//   (prepareSubscriptionMirror, network only) → short DB transaction
//   (INSERT stripe_event + upsert). The transaction never spans a Stripe
//   network call — every retrieve above has already completed by the time it
//   opens.

export const Route = createFileRoute("/api/billing/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature");
        const secret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!signature || !secret) {
          console.error("webhook: missing signature header or STRIPE_WEBHOOK_SECRET");
          return Response.json({ error: "Webhook not configured" }, { status: 500 });
        }

        let event: ReturnType<typeof stripe.webhooks.constructEvent>;
        try {
          event = stripe.webhooks.constructEvent(rawBody, signature, secret);
        } catch (e) {
          console.error("webhook: signature verification failed", e);
          return Response.json({ error: "Invalid signature" }, { status: 400 });
        }

        // Fast path for redelivery: skip the Stripe retrieve entirely when
        // we already recorded this event id.
        const [already] = await db
          .select({ id: stripeEvent.id })
          .from(stripeEvent)
          .where(eq(stripeEvent.id, event.id))
          .limit(1);
        if (already) {
          return Response.json({ received: true }, { status: 200 });
        }

        let prepared: Awaited<ReturnType<typeof prepareSubscriptionMirror>>;
        try {
          prepared = await prepareSubscriptionMirror(event);
        } catch (e) {
          // Stripe network failure, or a DB error resolving userId — no
          // event row written yet, so a 500 is a safe Stripe retry.
          console.error("webhook: failed to prepare event", event.id, event.type, e);
          return Response.json({ error: "Internal error" }, { status: 500 });
        }

        if (!prepared) {
          // Either an event type this pipeline doesn't mirror, or a userId
          // that can never resolve (e.g. the account was deleted after
          // Stripe queued this event) — log and stop Stripe from retrying.
          console.log("webhook: no-op event", event.id, event.type);
          return Response.json({ received: true }, { status: 200 });
        }

        try {
          await db.transaction(async (tx) => {
            await tx.insert(stripeEvent).values({ id: event.id, type: event.type });
            await upsertFromStripeSubscription(tx, prepared.userId, prepared.sub);
          });
        } catch (e) {
          if (isDuplicateEventInsert(e)) {
            // Redelivered concurrently with another request already applying
            // this event id — already handled (or about to be); safe 200.
            // Only the stripe_event insert counts: a unique violation from the
            // subscription upsert means nothing was mirrored, so it falls
            // through to the 500 below and Stripe retries.
            return Response.json({ received: true }, { status: 200 });
          }
          console.error("webhook: failed to apply event", event.id, event.type, e);
          return Response.json({ error: "Internal error" }, { status: 500 });
        }

        return Response.json({ received: true }, { status: 200 });
      },
    },
  },
});
