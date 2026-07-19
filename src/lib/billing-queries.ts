/* ============================================================
   DB queries for billing/entitlements. Like account-queries.ts,
   this imports "@/db" (server-only) and must only be reached from
   server routes / server fns / tests after createTestDb(). Pure
   plan logic lives in entitlements.ts; this module is the Drizzle
   read layer over the subscription mirror.
   ============================================================ */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscription } from "@/db/schema";
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
