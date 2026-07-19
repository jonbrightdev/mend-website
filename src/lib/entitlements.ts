export type PlanId = "free" | "pro";

/** Stripe subscription statuses we mirror. Free users have no subscription row. */
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export interface PlanLimits {
  plan: PlanId; // effective plan
  ingestPerMinute: number;
  maxActiveApiKeys: number;
  auditRetentionDays: number;
  maxStoredAudits: number; // Infinity = no cap (legacy free when unenforced)
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    plan: "free",
    ingestPerMinute: 60,
    maxActiveApiKeys: 3,
    auditRetentionDays: 30,
    maxStoredAudits: 200,
  },
  pro: {
    plan: "pro",
    ingestPerMinute: 300,
    maxActiveApiKeys: 20,
    auditRetentionDays: 730, // 2 years
    maxStoredAudits: 50_000,
  },
};

/** Pre-billing Free behavior when FREE_LIMITS_ENFORCED is not true. */
export const LEGACY_FREE_LIMITS: PlanLimits = {
  plan: "free",
  ingestPerMinute: 60,
  maxActiveApiKeys: 20,
  auditRetentionDays: Number.POSITIVE_INFINITY,
  maxStoredAudits: Number.POSITIVE_INFINITY,
};

export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function effectivePlan(input: {
  productPlan: PlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  now?: Date;
}): PlanId {
  const now = input.now ?? new Date();
  if (input.productPlan !== "pro") return "free";

  switch (input.status) {
    case "active":
    case "trialing":
      return "pro";
    case "past_due": {
      // Keep Pro while Stripe retries, up to period end + 7 days.
      // Null periodEnd → free (broken mirror; do not invent infinite grace).
      if (!input.currentPeriodEnd) return "free";
      if (now.getTime() <= input.currentPeriodEnd.getTime() + PAST_DUE_GRACE_MS) {
        return "pro";
      }
      return "free";
    }
    case "canceled": {
      if (input.currentPeriodEnd && now.getTime() < input.currentPeriodEnd.getTime()) {
        return "pro";
      }
      return "free";
    }
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return "free";
    default:
      return "free";
  }
}

export function limitsFor(
  effective: PlanId,
  opts?: { freeLimitsEnforced: boolean },
): PlanLimits {
  if (effective === "pro") return PLAN_LIMITS.pro;
  if (opts?.freeLimitsEnforced === false) return LEGACY_FREE_LIMITS;
  return PLAN_LIMITS.free;
}

/** True only when FREE_LIMITS_ENFORCED === "true" (string compare). */
export function areFreeLimitsEnforced(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.FREE_LIMITS_ENFORCED === "true";
}
