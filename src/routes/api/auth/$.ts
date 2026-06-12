import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";

// Better Auth owns everything under /api/auth/*. The server handlers are
// compiled out of the client bundle, so importing auth here is server-only.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
