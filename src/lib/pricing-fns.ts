/* ============================================================
   Loader for the public /pricing page. Unlike fetchAccount this
   never redirects — the page renders for signed-out visitors, who
   simply get `billing: null` and CTAs that point at signup.

   Like account-fns.ts, this file only exports server functions and
   types, so the "@/db" reach through billing-queries stays server-side.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { currentSessionUser, type SessionUser } from "@/lib/session";
import { isBillingEnabled } from "@/lib/billing-config";
import { getBillingSummary, type BillingSummary } from "@/lib/billing-queries";

export type { BillingSummary } from "@/lib/billing-queries";

export interface PricingData {
  user: SessionUser | null;
  /** Null for signed-out visitors — there is no subscription to summarise. */
  billing: BillingSummary | null;
  /** Whether Checkout is configured at all; drives whether paid CTAs render. */
  billingEnabled: boolean;
}

export const fetchPricing = createServerFn({ method: "GET" }).handler(
  async (): Promise<PricingData> => {
    const user = await currentSessionUser();
    if (!user) {
      return { user: null, billing: null, billingEnabled: isBillingEnabled() };
    }
    const billing = await getBillingSummary(user.id);
    return { user, billing, billingEnabled: billing.billingEnabled };
  },
);
