import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";
import { buildExport } from "@/lib/export-data";

// Downloads everything Mend has stored for the signed-in account as one JSON
// file. Session-cookie auth only — this is a same-origin browser action from
// the account page, not the extension's ingest path, so there is no
// Authorization-header fallback and deliberately no CORS headers.
export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const bundle = await buildExport(session.user.id);
        return new Response(JSON.stringify(bundle, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="mend-export-${bundle.exportedAt.slice(0, 10)}.json"`,
          },
        });
      },
    },
  },
});
