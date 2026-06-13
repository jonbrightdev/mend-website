import { getRequest } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";

// SERVER-ONLY. This module imports `@tanstack/react-start/server`, so it must
// never be imported by client-reachable code (route components, client
// components). Server functions and server routes may import it freely; route
// files should go through @/lib/session-fns instead.

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

// Reads the current request's session. Only callable in a server context.
export async function currentSessionUser(): Promise<SessionUser | null> {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}
