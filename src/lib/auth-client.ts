import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Base URL defaults to the current origin in the browser. The magic-link client
// plugin is always registered so the typed call exists; the UI only surfaces it
// when NEXT_PUBLIC_AUTH_MAGIC_LINK is enabled (see auth-features.ts).
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
