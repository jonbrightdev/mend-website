/* ============================================================
   Server function behind the /vpat preview page. Session-guarded;
   the report is always built for the caller's own audits.

   Everything that touches "@/db" stays in vpat-data.ts — a plain
   export here that reaches the database survives into the client
   bundle and fails the build's server-only import protection.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { currentSessionUser } from "@/lib/session";
import { buildVpatData } from "@/lib/vpat-data";

export const fetchVpatPreview = createServerFn({ method: "GET" }).handler(async () => {
  const user = await currentSessionUser();
  if (!user) throw redirect({ to: "/login" });

  // An empty name lets buildVpatData fall back to the audited hostnames, which
  // is also what the download route does when the form is left untouched.
  const report = await buildVpatData(user.id, "", user.email);
  return { user, report };
});
