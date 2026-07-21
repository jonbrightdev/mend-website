import { createFileRoute } from "@tanstack/react-router";
import { json, readScreenshot, requireAuditor } from "@/lib/manual-audit";

// GET /api/manual/screenshots/$key — serve a finding's screenshot. Auditor-only
// for now; when the customer dashboard renders findings it will need its own
// session-cookie path that checks the audit's userId (keys are unguessable
// UUIDs, but that is not an authorization story on its own).

export const Route = createFileRoute("/api/manual/screenshots/$key")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const who = await requireAuditor(request);
        if (!who) return json({ error: "Unauthorized" }, 401);

        const data = await readScreenshot(params.key);
        if (!data) return json({ error: "Not found" }, 404);
        return new Response(new Uint8Array(data), {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
