import "@tanstack/react-start/server-only";
import Stripe from "stripe";

// SERVER-ONLY. Holds STRIPE_SECRET_KEY, which must never reach the client, so
// this module must never be imported by client-reachable code. The secret is a
// plain (non-VITE_) env var for that reason.
//
// apiVersion is pinned to the installed `stripe` package's own `LatestApiVersion`
// (stripe 22.3.2 → `2026-06-24.dahlia`). Dahlia is well past basil, so
// subscription period fields live on SubscriptionItem, which plan 038's webhook
// mirror reads. Bump this string together with the `stripe` package, not apart.
//
// Construction is lazy (first property access), not at module load: the Stripe
// SDK throws immediately if handed an empty apiKey, and this module is now
// imported by src/lib/auth.ts for beforeDelete cleanup — which many unrelated
// tests pull in transitively without ever configuring or touching Stripe.
// Callers that gate on isBillingEnabled() before touching `stripe.*` (or, like
// cleanupStripeBeforeDelete, only reach it when a stripeCustomerId already
// exists) never trigger construction when Stripe isn't configured.
function createStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
    apiVersion: "2026-06-24.dahlia",
    typescript: true,
  });
}

let client: Stripe | undefined;

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    client ??= createStripeClient();
    return Reflect.get(client, prop);
  },
});
