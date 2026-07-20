import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";
import { buildVpatData } from "@/lib/vpat-data";
import { renderVpatHtml } from "@/lib/vpat-render";

// A name long enough for any real product, short enough that it can't be used
// to pad the document with megabytes of attacker-chosen text.
const MAX_NAME = 200;

// Downloads the account's Accessibility Conformance Report as one standalone
// HTML file. Session-cookie auth only — a same-origin browser action from the
// /vpat page, so no Authorization fallback and deliberately no CORS headers,
// matching /api/export.
export const Route = createFileRoute("/api/vpat")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const name = (new URL(request.url).searchParams.get("name") ?? "").slice(0, MAX_NAME);
        const data = await buildVpatData(session.user.id, name, session.user.email);
        if (!data) {
          return Response.json(
            { error: "No audits yet — scan at least one page before generating a report." },
            { status: 404 },
          );
        }

        return new Response(renderVpatHtml(data), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="accessibility-conformance-report-${data.generatedAt.slice(0, 10)}.html"`,
          },
        });
      },
    },
  },
});
