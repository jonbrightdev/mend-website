import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { VpatClient } from "@/components/VpatClient";
import { fetchVpatPreview } from "@/lib/vpat-fns";

export const Route = createFileRoute("/vpat")({
  loader: () => fetchVpatPreview(),
  head: () => ({
    meta: [
      { title: "Accessibility conformance report — Mend" },
      {
        name: "description",
        content:
          "Generate a VPAT-format accessibility conformance report from your audit data, as an automated assessment against WCAG 2.2 Level A and AA.",
      },
    ],
  }),
  component: VpatPage,
});

function VpatPage() {
  const { user, report } = Route.useLoaderData();
  return (
    // No nav entry of its own — reached from the dashboard and the account
    // page, so it keeps the dashboard highlighted the way the audit detail
    // pages do.
    <MarketingShell current="dashboard" account={{ name: user.name, email: user.email }}>
      <VpatClient report={report} />
    </MarketingShell>
  );
}
