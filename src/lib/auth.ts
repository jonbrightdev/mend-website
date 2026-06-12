import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

// Google is added only when both credentials are present; magic link only when
// explicitly enabled. Email + password is always available. This keeps the
// optional sign-in methods entirely behind configuration.
const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
const magicLinkEnabled = import.meta.env.VITE_AUTH_MAGIC_LINK === "true";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  ...(googleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          },
        },
      }
    : {}),
  plugins: magicLinkEnabled
    ? [
        magicLink({
          sendMagicLink: async ({ email, url }) => {
            // TODO: wire a real email provider (Resend/Postmark/SMTP) before
            // enabling this in production. Dev fallback logs the link so it can
            // be exercised locally without an email service.
            console.log(`[magic-link] ${email}: ${url}`);
          },
        }),
      ]
    : [],
});
