import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

// Plain helper for use inside other server functions / server routes.
// Only callable in a server context (it reads the current request).
export async function currentSessionUser(): Promise<SessionUser | null> {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}

// Server-only session lookup. Returns the signed-in user or null; never throws.
export const getSessionUser = createServerFn({ method: "GET" }).handler(() =>
  currentSessionUser(),
);

// Gate for protected routes: call from a loader/beforeLoad. Redirects to
// /login when there is no valid session, otherwise returns the user.
export const requireUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser> => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return user;
  },
);
