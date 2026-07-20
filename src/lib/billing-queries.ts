/* ============================================================
   DB queries for billing/entitlements. Like account-queries.ts,
   this imports "@/db" (server-only) and must only be reached from
   server routes / server fns / tests after createTestDb(). Pure
   plan logic lives in entitlements.ts; this module is the Drizzle
   read layer over the subscription mirror.
   ============================================================ */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscription, user } from "@/db/schema";
import { isBillingEnabled } from "@/lib/billing-config";
import {
  areFreeLimitsEnforced,
  effectivePlan,
  limitsFor,
  type PlanLimits,
  type PlanId,
  type SubscriptionStatus,
} from "@/lib/entitlements";

export async function getUserEntitlements(userId: string): Promise<PlanLimits> {
  const enforced = areFreeLimitsEnforced();
  const row = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);
  if (row.length === 0) return limitsFor("free", { freeLimitsEnforced: enforced });
  const s = row[0]!;
  const effective = effectivePlan({
    productPlan: s.plan as PlanId,
    status: s.status as SubscriptionStatus,
    currentPeriodEnd: s.currentPeriodEnd,
  });
  return limitsFor(effective, { freeLimitsEnforced: enforced });
}

/**
 * Everything the account/billing UI needs, in one client-safe shape. Dates are
 * ISO strings because this crosses the createServerFn boundary.
 *
 * `plan` is the *effective* plan (what the user is entitled to right now);
 * `productPlan` is what they bought. They differ during the grace windows
 * effectivePlan() encodes — a past_due card still on Pro, or a canceled
 * subscription running out its paid period.
 */
export interface BillingSummary {
  plan: PlanId;
  productPlan: PlanId;
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  interval: "month" | "year" | null;
  canUpgrade: boolean;
  canManage: boolean;
  billingEnabled: boolean;
  freeLimitsEnforced: boolean;
}

export async function getBillingSummary(userId: string): Promise<BillingSummary> {
  const billingEnabled = isBillingEnabled();
  const freeLimitsEnforced = areFreeLimitsEnforced();

  const [row] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);
  const [owner] = await db
    .select({ stripeCustomerId: user.stripeCustomerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const productPlan = (row?.plan ?? "free") as PlanId;
  const plan = row
    ? effectivePlan({
        productPlan,
        status: row.status as SubscriptionStatus,
        currentPeriodEnd: row.currentPeriodEnd,
      })
    : "free";

  return {
    plan,
    productPlan,
    status: (row?.status as SubscriptionStatus | undefined) ?? null,
    currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
    interval: row?.interval ?? null,
    // Offer Checkout only when it would actually succeed: the route 409s with
    // ALREADY_SUBSCRIBED for anyone effectivePlan() still counts as Pro.
    canUpgrade: billingEnabled && plan === "free",
    canManage: billingEnabled && Boolean(owner?.stripeCustomerId),
    billingEnabled,
    freeLimitsEnforced,
  };
}

/** Test helper: insert a Pro active subscription for userId. */
export async function seedProSubscription(userId: string): Promise<void> {
  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(subscription).values({
    id: crypto.randomUUID(),
    userId,
    stripeSubscriptionId: `sub_test_${userId}`,
    stripePriceId: "price_test_pro_monthly",
    plan: "pro",
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    interval: "month",
  });
}
