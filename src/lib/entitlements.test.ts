import { describe, expect, it } from "vitest";
import {
  LEGACY_FREE_LIMITS,
  PLAN_LIMITS,
  PAST_DUE_GRACE_MS,
  areFreeLimitsEnforced,
  effectivePlan,
  limitsFor,
  type SubscriptionStatus,
} from "@/lib/entitlements";

const NOW = new Date("2026-07-19T00:00:00Z");
const FUTURE = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
const PAST = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000);

describe("effectivePlan", () => {
  it("is always free when the product plan is free, regardless of status", () => {
    const statuses: SubscriptionStatus[] = [
      "active",
      "trialing",
      "past_due",
      "canceled",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
    ];
    for (const status of statuses) {
      expect(
        effectivePlan({
          productPlan: "free",
          status,
          currentPeriodEnd: FUTURE,
          now: NOW,
        }),
      ).toBe("free");
    }
  });

  it("is pro for active and trialing", () => {
    expect(
      effectivePlan({ productPlan: "pro", status: "active", currentPeriodEnd: FUTURE, now: NOW }),
    ).toBe("pro");
    expect(
      effectivePlan({ productPlan: "pro", status: "trialing", currentPeriodEnd: FUTURE, now: NOW }),
    ).toBe("pro");
  });

  it("keeps pro for past_due while within period end + grace", () => {
    expect(
      effectivePlan({ productPlan: "pro", status: "past_due", currentPeriodEnd: FUTURE, now: NOW }),
    ).toBe("pro");
  });

  it("drops past_due to free once past period end + 7 days", () => {
    const wayPast = new Date(NOW.getTime() - PAST_DUE_GRACE_MS - 1000);
    expect(
      effectivePlan({
        productPlan: "pro",
        status: "past_due",
        currentPeriodEnd: wayPast,
        now: NOW,
      }),
    ).toBe("free");
  });

  it("drops past_due with a null period end to free (safe fail)", () => {
    expect(
      effectivePlan({ productPlan: "pro", status: "past_due", currentPeriodEnd: null, now: NOW }),
    ).toBe("free");
  });

  it("keeps pro for canceled before the period end", () => {
    expect(
      effectivePlan({ productPlan: "pro", status: "canceled", currentPeriodEnd: FUTURE, now: NOW }),
    ).toBe("pro");
  });

  it("drops canceled to free after the period end", () => {
    expect(
      effectivePlan({ productPlan: "pro", status: "canceled", currentPeriodEnd: PAST, now: NOW }),
    ).toBe("free");
  });

  it("is free for unpaid, incomplete, incomplete_expired and paused", () => {
    const statuses: SubscriptionStatus[] = [
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
    ];
    for (const status of statuses) {
      expect(
        effectivePlan({ productPlan: "pro", status, currentPeriodEnd: FUTURE, now: NOW }),
      ).toBe("free");
    }
  });
});

describe("limitsFor", () => {
  it("returns legacy free limits (20 keys, ∞ audits) when free limits are unenforced", () => {
    const limits = limitsFor("free", { freeLimitsEnforced: false });
    expect(limits).toEqual(LEGACY_FREE_LIMITS);
    expect(limits.maxActiveApiKeys).toBe(20);
    expect(limits.maxStoredAudits).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns enforced free limits (3 keys, 200 audits, 30d) when enforced", () => {
    const limits = limitsFor("free", { freeLimitsEnforced: true });
    expect(limits).toEqual(PLAN_LIMITS.free);
    expect(limits.maxActiveApiKeys).toBe(3);
    expect(limits.maxStoredAudits).toBe(200);
    expect(limits.auditRetentionDays).toBe(30);
  });

  it("always returns pro limits regardless of the enforce flag", () => {
    expect(limitsFor("pro", { freeLimitsEnforced: false })).toEqual(PLAN_LIMITS.pro);
    expect(limitsFor("pro", { freeLimitsEnforced: true })).toEqual(PLAN_LIMITS.pro);
  });
});

describe("areFreeLimitsEnforced", () => {
  it("is true only for the exact string 'true'", () => {
    expect(areFreeLimitsEnforced({ FREE_LIMITS_ENFORCED: "true" })).toBe(true);
    expect(areFreeLimitsEnforced({ FREE_LIMITS_ENFORCED: "false" })).toBe(false);
    expect(areFreeLimitsEnforced({ FREE_LIMITS_ENFORCED: "1" })).toBe(false);
    expect(areFreeLimitsEnforced({ FREE_LIMITS_ENFORCED: "TRUE" })).toBe(false);
    expect(areFreeLimitsEnforced({})).toBe(false);
  });
});
