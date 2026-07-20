import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { getSessionUser } from "@/lib/session-fns";

// Where Stripe Checkout returns when the user backs out. Nothing was charged
// and nothing changed, so this page only reassures and offers the way back.
export const Route = createFileRoute("/billing/cancel")({
  loader: () => getSessionUser(),
  head: () => ({
    meta: [
      { title: "Checkout canceled — Mend" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CancelPage,
});

function CancelPage() {
  const user = Route.useLoaderData();

  return (
    <MarketingShell
      current="account"
      account={user ? { name: user.name, email: user.email } : undefined}
    >
      <div className="wrap app-main">
        <div className="panel" style={{ maxWidth: "44rem" }}>
          <div className="panel__head">
            <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Checkout canceled</h1>
          </div>
          <div className="panel__body">
            <p style={{ marginTop: 0, maxWidth: "60ch" }}>
              No payment was taken and nothing about your account changed. You
              can upgrade any time from your account settings — and the Mend
              extension keeps scanning for free either way.
            </p>
            <div className="danger-action__row" style={{ marginTop: "1.2rem" }}>
              <Link className="btn btn--primary" to="/account">
                Back to account
              </Link>
              <Link className="btn btn--ghost" to="/dashboard">
                Go to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
