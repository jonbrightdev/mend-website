import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { MonitorsClient } from "@/components/MonitorsClient";
import { fetchMonitors } from "@/lib/monitor-fns";

export const Route = createFileRoute("/monitors")({
  loader: () => fetchMonitors(),
  head: () => ({
    meta: [
      { title: "Monitors — Mend" },
      {
        name: "description",
        content:
          "Pages Mend audits for you once a day, with results on your dashboard.",
      },
    ],
  }),
  component: MonitorsPage,
});

function MonitorsPage() {
  const { user, monitors, maxMonitors } = Route.useLoaderData();
  return (
    <MarketingShell
      current="monitors"
      account={{ name: user.name, email: user.email }}
    >
      <MonitorsClient initialMonitors={monitors} maxMonitors={maxMonitors} />
    </MarketingShell>
  );
}
