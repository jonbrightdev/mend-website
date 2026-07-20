import "@tanstack/react-start/server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth, magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { user } from "@/db/schema";
import { sendMail } from "@/lib/mailer";

// Social providers are added only when both credentials are present; magic
// link only when explicitly enabled. Email + password is always available.
// This keeps the optional sign-in methods entirely behind configuration.
const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
const githubEnabled = Boolean(
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
);
const magicLinkEnabled = import.meta.env.VITE_AUTH_MAGIC_LINK === "true";

// Statuses that still hold a customer's billing method / entitlement and so
// need an explicit cancel before we delete the account. Skips subscriptions
// already terminal (canceled / incomplete_expired) — canceling those again
// would just error against Stripe for no benefit.
const CANCELABLE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]);

/**
 * Fail-closed Stripe cleanup run before Better Auth deletes the account (see
 * plans/pricing-stripe-design.md §Account delete). The session user does not
 * carry stripeCustomerId (kept off the session payload), so it's loaded here
 * with an explicit Drizzle query. A free user (no Stripe customer) returns
 * immediately — delete proceeds normally. A Pro user's cancel/delete failing
 * against Stripe throws, which aborts the account delete: we'd rather block
 * deletion and let the user retry than silently leave an orphaned paid
 * subscription with no Mend account attached to it.
 */
export async function cleanupStripeBeforeDelete(sessionUser: { id: string }): Promise<void> {
  const [row] = await db
    .select({ stripeCustomerId: user.stripeCustomerId })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);
  if (!row?.stripeCustomerId) return; // free path: nothing to clean up

  try {
    // Loaded lazily: auth.ts is imported by nearly every server module (and
    // test suite), while @/lib/stripe constructs its client at import time and
    // throws without STRIPE_SECRET_KEY. Only this paid path needs it — and a
    // missing key here still fails closed via this catch.
    const { stripe } = await import("@/lib/stripe");
    const subs = await stripe.subscriptions.list({
      customer: row.stripeCustomerId,
      status: "all",
    });
    await Promise.all(
      subs.data
        .filter((s) => CANCELABLE_SUBSCRIPTION_STATUSES.has(s.status))
        .map((s) => stripe.subscriptions.cancel(s.id)),
    );
    // Also strips PII (email, name) from Stripe once nothing is billing.
    await stripe.customers.del(row.stripeCustomerId);
  } catch (e) {
    console.error("stripe cleanup failed before account delete", e);
    throw new Error(
      "Could not cancel your subscription before deleting the account. Please try again or contact support.",
    );
  }
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // `url` points at Better Auth's own /reset-password/:token endpoint, which
    // validates the token and then redirects to the requested callback with it
    // in the query string — so the user lands on our /reset-password page.
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your Mend password",
        text: `Someone requested a password reset for your Mend account.\n\nReset it here (link expires in 1 hour):\n${url}\n\nIf this wasn't you, you can ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // `url` is Better Auth's own /verify-email endpoint; it validates the
    // token, flips user.emailVerified, and redirects to the app.
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Verify your Mend email",
        text: `Welcome to Mend!\n\nConfirm this email address so password reset and sign-in emails reach you:\n${url}\n\nIf you didn't create a Mend account, you can ignore this email.`,
      });
    },
  },
  // Lets a signed-in user delete their own account from the account page.
  // Email+password users re-verify with their password on the client call; the
  // database cascades (audit→violation, apiKey, session, account) clear the rest.
  // beforeDelete fails closed for Pro users — see cleanupStripeBeforeDelete.
  user: {
    deleteUser: { enabled: true, beforeDelete: cleanupStripeBeforeDelete },
  },
  socialProviders: {
    ...(googleEnabled
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          },
        }
      : {}),
    // GitHub is deliberately NOT in socialProviders — see the genericOAuth
    // plugin below for why.
  },
  plugins: [
    ...(magicLinkEnabled
      ? [
          magicLink({
            // The dev fallback (logging the link) now lives in the mailer, so
            // this works locally with no email service and in production once
            // RESEND_API_KEY/EMAIL_FROM are set.
            sendMagicLink: async ({ email, url }) => {
              await sendMail({
                to: email,
                subject: "Your Mend sign-in link",
                text: `Sign in to Mend (link expires in 15 minutes):\n${url}\n\nIf you didn't request this, you can ignore this email.`,
              });
            },
          }),
        ]
      : []),
    // GitHub goes through genericOAuth instead of socialProviders.github:
    // Better Auth's core createAuthorizationURL() always attaches a PKCE
    // code_challenge whenever a codeVerifier is generated, which it is
    // unconditionally for every socialProviders entry in this version. GitHub's
    // classic OAuth Apps authorize endpoint doesn't support PKCE and returns a
    // bare 404 (not an OAuth error) when it sees code_challenge, breaking
    // sign-in outright. genericOAuth exposes a per-provider `pkce` flag, so we
    // use it just for GitHub and set pkce: false. Revisit this if a future
    // Better Auth release adds that flag to socialProviders directly.
    ...(githubEnabled
      ? [
          genericOAuth({
            config: [
              {
                providerId: "github",
                clientId: process.env.GITHUB_CLIENT_ID as string,
                clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
                authorizationUrl: "https://github.com/login/oauth/authorize",
                tokenUrl: "https://github.com/login/oauth/access_token",
                scopes: ["read:user", "user:email"],
                pkce: false,
                // GitHub's /user endpoint omits email when the user has kept
                // it private, so (like Better Auth's own github provider)
                // fall back to the dedicated /user/emails endpoint and use
                // the primary verified address.
                getUserInfo: async (tokens) => {
                  const headers = {
                    "User-Agent": "better-auth",
                    Authorization: `Bearer ${tokens.accessToken}`,
                  };
                  const profileRes = await fetch("https://api.github.com/user", {
                    headers,
                  });
                  const profile = await profileRes.json();
                  let emails: Array<{ email: string; primary: boolean; verified: boolean }> | null = null;
                  if (!profile.email) {
                    const emailsRes = await fetch(
                      "https://api.github.com/user/emails",
                      { headers },
                    );
                    if (emailsRes.ok) emails = await emailsRes.json();
                    profile.email = (emails?.find((e) => e.primary) ?? emails?.[0])?.email;
                  }
                  const emailVerified =
                    emails?.find((e) => e.email === profile.email)?.verified ?? false;
                  return {
                    id: String(profile.id),
                    name: profile.name || profile.login || "",
                    email: profile.email,
                    image: profile.avatar_url,
                    emailVerified,
                  };
                },
              },
            ],
          }),
        ]
      : []),
  ],
});
