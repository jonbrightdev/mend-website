import type { ReactNode } from "react";
// Portal-only styles. Importing here scopes app.css to the portal routes
// (login, signup, dashboard) so the marketing pages stay lean.
import "../app.css";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
