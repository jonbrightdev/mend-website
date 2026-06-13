/* ============================================================
   Session server functions, safe to import from client-reachable
   route files. This module exports ONLY server functions, so the
   TanStack Start plugin replaces it with RPC stubs on the client
   and tree-shakes the server-only session.ts import away — keeping
   `@tanstack/react-start/server` out of the client bundle.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { currentSessionUser, type SessionUser } from "@/lib/session";

// Returns the signed-in user or null; never throws. For headers/footers and
// pages that render either way.
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  (): Promise<SessionUser | null> => currentSessionUser(),
);

// Gate for protected routes: redirects to /login when there is no session.
export const requireUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser> => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return user;
  },
);
