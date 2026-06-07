import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MarketingShell } from "@/components/MarketingShell";
import { auth } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

// Authoritative session check against the database (middleware does the fast
// cookie-presence redirect). Reading headers() forces dynamic rendering, so this
// page is never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }
  const { user } = session;

  return (
    <MarketingShell
      current="dashboard"
      account={{ name: user.name, email: user.email }}
    >
      <section className="section">
        <div className="wrap">
          <p className="eyebrow">Dashboard</p>
          <h1>You&apos;re signed in.</h1>
          <p className="lede">
            Signed in as {user.name} ({user.email}).
          </p>
          <div className="card" style={{ marginTop: "1.5rem", maxWidth: "60ch" }}>
            <p style={{ margin: 0 }}>
              The dashboard arrives in the next stage: stat cards, issues grouped
              by rule, a per-page table, filters, and the trend over time, fed by
              the audits the extension sends to the ingest endpoint.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
