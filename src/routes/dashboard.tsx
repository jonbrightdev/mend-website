import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { DashboardClient } from "@/components/DashboardClient";
import { fetchDashboard } from "@/lib/dashboard-fns";

export const Route = createFileRoute("/dashboard")({
  loader: () => fetchDashboard(),
  head: () => ({
    meta: [
      { title: "Dashboard — Mend" },
      {
        name: "description",
        content:
          "Aggregate view of accessibility violations across every page you've audited with Mend.",
      },
    ],
  }),
  pendingComponent: DashboardPending,
  component: DashboardPage,
});

function DashboardPage() {
  const { user, audits, runDates, hasActiveKey } = Route.useLoaderData();
  return (
    <MarketingShell
      current="dashboard"
      account={{ name: user.name, email: user.email }}
    >
      <DashboardClient
        audits={audits}
        runDates={runDates}
        hasActiveKey={hasActiveKey}
      />
    </MarketingShell>
  );
}

function DashboardPending() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SiteHeader current="dashboard" />
      <main id="main">
        <div className="wrap app-main">
          <div className="loading-note">
            <span className="spinner" aria-hidden="true" />
            Loading your audits…
          </div>
          <div className="stats">
            <div className="sk sk-stat" />
            <div className="sk sk-stat" />
            <div className="sk sk-stat" />
            <div className="sk sk-stat" />
          </div>
          <div className="sk sk-chart" style={{ marginBottom: "1.4rem" }} />
          <div className="sk sk-row" />
          <div className="sk sk-row" />
          <div className="sk sk-row" />
          <div className="sk sk-row" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
