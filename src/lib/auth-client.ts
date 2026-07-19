import { createAuthClient } from "better-auth/react";
import {
  genericOAuthClient,
  magicLinkClient,
} from "better-auth/client/plugins";

// Base URL defaults to the current origin in the browser. The magic-link and
// generic-oauth client plugins are always registered so the typed calls
// exist; the UI only surfaces GitHub/magic-link when the matching
// VITE_AUTH_* flag is enabled (see auth-features.ts). GitHub goes through
// genericOAuthClient (signIn.oauth2) rather than the built-in social
// provider — see the comment in src/lib/auth.ts for why.
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), genericOAuthClient()],
});
