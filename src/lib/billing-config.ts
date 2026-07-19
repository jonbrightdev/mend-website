// Pure env helpers for billing. No Stripe network, no "@/db" — safe to import
// from route modules and unit-test directly. Price *IDs* live in env (from the
// Stripe Dashboard); the client only ever sends a plan key, never a raw id.

export type CheckoutPriceKey = "pro_monthly" | "pro_yearly";

/**
 * Billing is enabled only when the secret key and both Pro price IDs are set.
 * Missing any one → routes return 503 rather than half-configuring Checkout.
 * Pro: $9/mo · $90/yr (founder-approved).
 */
export function isBillingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_PRICE_PRO_MONTHLY &&
      env.STRIPE_PRICE_PRO_YEARLY,
  );
}

export function priceIdFor(
  key: CheckoutPriceKey,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const id =
    key === "pro_monthly"
      ? env.STRIPE_PRICE_PRO_MONTHLY
      : env.STRIPE_PRICE_PRO_YEARLY;
  if (!id) throw new Error(`Missing Stripe price id for ${key}`);
  return id;
}

/** Narrows an untrusted request body to a known plan key, or throws. */
export function parseCheckoutPrice(body: unknown): CheckoutPriceKey {
  if (
    body &&
    typeof body === "object" &&
    "price" in body &&
    ((body as { price: unknown }).price === "pro_monthly" ||
      (body as { price: unknown }).price === "pro_yearly")
  ) {
    return (body as { price: CheckoutPriceKey }).price;
  }
  throw new Error("Invalid price");
}
