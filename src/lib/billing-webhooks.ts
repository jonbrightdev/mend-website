import "@tanstack/react-start/server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscription, user } from "@/db/schema";
import { stripe } from "@/lib/stripe";
import type { SubscriptionStatus } from "@/lib/entitlements";

// Pure-ish helpers for the Stripe webhook pipeline (src/routes/api/billing/webhook.ts).
// Split into three layers, matching plans/pricing-stripe-design.md §Webhooks:
//   1. Pure functions (periodFromSubscription, planFromPriceId, intervalFromPriceId,
//      shouldApplySubscriptionMirror) — no I/O, unit-testable with plain fixtures.
//   2. Network-only preparation (resolveUserId, retrieveSubscriptionForEvent,
//      prepareSubscriptionMirror) — ALL Stripe HTTP happens here, before any DB
//      transaction opens.
//   3. Transactional apply (upsertFromStripeSubscription) — pure local reads/writes
//      against the `tx` handed in by the route; no Stripe network calls allowed here.
//
// Fixtures **must** be basil+-shaped: periods live on SubscriptionItem
// (items.data[0].current_period_start/end), not on the subscription itself.

/** The transaction type db.transaction()'s callback receives — reused so
 * upsertFromStripeSubscription can be called from inside the route's own
 * `db.transaction(async (tx) => ...)` block. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Basil+ moved current_period_start/end off Subscription and onto its first
 * SubscriptionItem. Missing fields throw so the caller's DB transaction rolls
 * back (no stripe_event row retained) and Stripe retries the webhook. */
export function periodFromSubscription(sub: Stripe.Subscription): {
  start: Date;
  end: Date;
} {
  const item = sub.items.data[0];
  if (!item?.current_period_start || !item?.current_period_end) {
    throw new Error(`subscription ${sub.id} missing item period fields`);
  }
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  };
}

/** subscription.plan is the product *purchased*, from the price id alone —
 * never derived from status. An unrecognized price id (misconfigured env,
 * stale Dashboard price) safely defaults to "free" rather than granting Pro. */
export function planFromPriceId(priceId: string): "pro" | "free" {
  if (
    priceId === process.env.STRIPE_PRICE_PRO_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_PRO_YEARLY
  ) {
    return "pro";
  }
  return "free";
}

export function intervalFromPriceId(priceId: string): "month" | "year" | null {
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return "month";
  if (priceId === process.env.STRIPE_PRICE_PRO_YEARLY) return "year";
  return null;
}

/** Statuses that grant Pro access; used only to decide whether a *different*
 * subscription id may replace the current mirror (resubscribe). Not the same
 * set effectivePlan() uses for entitlement (past_due there also gets a grace
 * window off currentPeriodEnd). */
const ENTITLING: ReadonlySet<string> = new Set(["active", "trialing", "past_due"]);

/**
 * Decides whether an incoming Subscription may write the user's mirror row.
 * Guards against late/out-of-order events for a *previous* subscription id
 * after cancel→resubscribe (see plans/pricing-stripe-design.md §Upsert
 * algorithm). Called with the existing mirror row (or null) and the incoming
 * subscription's id + status — never the full Stripe object, so this stays
 * trivially unit-testable.
 */
export function shouldApplySubscriptionMirror(
  existing: { stripeSubscriptionId: string; status: string } | null,
  incoming: { id: string; status: string },
): boolean {
  if (!existing) return true;
  if (existing.stripeSubscriptionId === incoming.id) return true;
  if (ENTITLING.has(incoming.status)) return true;
  return false;
}

/**
 * Applies a prepared Stripe.Subscription to the `subscription` mirror. Must
 * run inside the same short DB transaction as the stripe_event insert (see
 * webhook.ts) and must never make a Stripe network call itself — the object
 * passed in is already fully retrieved.
 */
export async function upsertFromStripeSubscription(
  tx: Tx,
  userId: string,
  sub: Stripe.Subscription,
): Promise<"applied" | "ignored_stale"> {
  const [existing] = await tx
    .select({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: subscription.status,
    })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  if (!shouldApplySubscriptionMirror(existing ?? null, { id: sub.id, status: sub.status })) {
    return "ignored_stale";
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  if (!priceId) {
    throw new Error(`subscription ${sub.id} has no price on its first item`);
  }

  const { start, end } = periodFromSubscription(sub);

  const values = {
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    plan: planFromPriceId(priceId),
    status: sub.status as SubscriptionStatus,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    interval: intervalFromPriceId(priceId),
    updatedAt: new Date(),
  };

  const updated = await tx
    .update(subscription)
    .set(values)
    .where(eq(subscription.userId, userId))
    .returning();

  if (updated.length === 0) {
    await tx.insert(subscription).values({
      id: crypto.randomUUID(),
      userId,
      ...values,
    });
  }

  return "applied";
}

/**
 * Resolves the Mend userId for a Subscription, outside any DB transaction
 * (may call Stripe + read-only DB). Order, per design doc:
 *   1) subscription.metadata.userId (set by checkout.ts on Checkout Session
 *      creation via subscription_data.metadata)
 *   2) customer.metadata.userId (retrieves the Customer)
 *   3) user.stripeCustomerId === customer (DB lookup fallback)
 * Returns null when none resolve — caller logs + returns 200 (event can
 * never apply, e.g. the user account was since deleted).
 */
export async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.userId) return sub.metadata.userId;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const customer = await stripe.customers.retrieve(customerId);
  if (!customer.deleted && customer.metadata?.userId) {
    return customer.metadata.userId;
  }

  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.stripeCustomerId, customerId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * All Stripe HTTP for a webhook event happens here, before any DB transaction
 * opens. Returns null for event types this pipeline doesn't mirror, or when
 * the event payload has nothing to retrieve (e.g. a non-subscription Checkout
 * Session) — the caller treats both as a no-op 200.
 */
export async function retrieveSubscriptionForEvent(
  event: Stripe.Event,
): Promise<Stripe.Subscription | null> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) return null;
      const subId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      return stripe.subscriptions.retrieve(subId);
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object;
    case "invoice.paid":
    case "invoice.payment_failed": {
      // basil+ removed Invoice.subscription; the subscription id now lives at
      // invoice.parent.subscription_details.subscription (see
      // plans/pricing-stripe-design.md §Webhooks).
      const invoice = event.data.object;
      const subRef = invoice.parent?.subscription_details?.subscription;
      if (!subRef) return null;
      const subId = typeof subRef === "string" ? subRef : subRef.id;
      return stripe.subscriptions.retrieve(subId);
    }
    default:
      return null;
  }
}

/**
 * Combines retrieval + userId resolution — the whole network-only "prepare"
 * step of the pipeline. Returns null when the event isn't one this pipeline
 * mirrors, or when no userId resolves (event can never apply).
 */
export async function prepareSubscriptionMirror(
  event: Stripe.Event,
): Promise<{ userId: string; sub: Stripe.Subscription } | null> {
  const sub = await retrieveSubscriptionForEvent(event);
  if (!sub) return null;
  const userId = await resolveUserId(sub);
  if (!userId) return null;
  return { userId, sub };
}

/**
 * A Postgres unique_violation (23505) raised specifically by the `stripe_event`
 * insert — i.e. this event id was already processed, so the delivery is a
 * duplicate the caller may safely acknowledge with a 200.
 *
 * Deliberately narrow. The `subscription` table carries its own unique indexes
 * (`subscription_user_uidx` on userId, plus stripeSubscriptionId), and those
 * fire on a real race: two events for a user with no mirror row yet (Stripe
 * commonly delivers `checkout.session.completed` and
 * `customer.subscription.created` together) both find nothing to UPDATE and
 * both INSERT, so the loser gets a 23505. That event's data was *not* written,
 * so it must surface as a 500 and let Stripe retry — on retry the row exists
 * and the UPDATE path applies it. Treating it as a duplicate would return 200,
 * stop the retry, and silently lose the update.
 *
 * Both the pg and PGlite drivers expose the failing relation under Drizzle's
 * DrizzleQueryError as `cause.table` / `cause.constraint`.
 */
export function isDuplicateEventInsert(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("cause" in error)) return false;
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause !== "object" || cause === null) return false;
  const { code, table, constraint } = cause as {
    code?: unknown;
    table?: unknown;
    constraint?: unknown;
  };
  if (code !== "23505") return false;
  return table === "stripe_event" || constraint === "stripe_event_pkey";
}
