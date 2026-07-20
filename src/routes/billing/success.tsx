import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { fetchAccount } from "@/lib/account-fns";

// Where Stripe Checkout returns on success. The `session_id` in the URL is
// deliberately ignored: it proves a Checkout session existed, not that the
// subscription is live. The only truth is the DB mirror the webhook writes
// (plan 038), so this page reads entitlements and — because the webhook can
// land a beat after the redirect — tells the user to refresh if it hasn't yet.
export const Route = createFileRoute("/billing/success")({
  loader: () => fetchAccount(),
  head: () => ({
    meta: [
      { title: "Welcome to Pro — Mend" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const { user, billing } = Route.useLoaderData();
  const isPro = billing.plan === "pro";

  return (
    <MarketingShell
      current="account"
      account={{ name: user.name, email: user.email }}
    >
      <div className="wrap app-main">
        <div className="panel" style={{ maxWidth: "44rem" }}>
          <div className="panel__head">
            <h1 style={{ fontSize: "1.4rem", margin: 0 }}>
              {isPro ? "You're on Pro" : "Thanks — finishing up"}
            </h1>
          </div>
          <div className="panel__body">
            {isPro ? (
              <p style={{ marginTop: 0, maxWidth: "60ch" }}>
                Your Pro dashboard is active: two years of audit history, room
                for 50,000 saved audits, and up to 20 API keys. Stripe has
                emailed your receipt.
              </p>
            ) : (
              <p style={{ marginTop: 0, maxWidth: "60ch" }}>
                Your payment went through. Stripe confirms subscriptions to us
                in the background, which occasionally takes a few seconds — if
                Pro isn&apos;t showing on your account yet, refresh this page in
                a moment.
              </p>
            )}
            <div className="danger-action__row" style={{ marginTop: "1.2rem" }}>
              <Link className="btn btn--primary" to="/dashboard">
                Go to dashboard
              </Link>
              <Link className="btn btn--ghost" to="/account">
                Account settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </MarketingShell>
  );
}
