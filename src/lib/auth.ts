import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
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
  // Lets a signed-in user delete their own account from the account page.
  // Email+password users re-verify with their password on the client call; the
  // database cascades (audit→violation, apiKey, session, account) clear the rest.
  user: {
    deleteUser: { enabled: true },
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
    ...(githubEnabled
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
          },
        }
      : {}),
  },
  plugins: magicLinkEnabled
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
    : [],
});
