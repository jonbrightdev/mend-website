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

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
  apiVersion: "2026-06-24.dahlia",
  typescript: true,
});
