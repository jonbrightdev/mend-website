import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingShell } from "@/components/MarketingShell";
import { fetchPricing } from "@/lib/pricing-fns";

export const Route = createFileRoute("/pricing")({
  loader: () => fetchPricing(),
  head: () => ({
    meta: [
      { title: "Pricing — Mend" },
      {
        name: "description",
        content:
          "The Mend extension is free and open source. Plans apply only to the optional cloud dashboard: Free, or Pro at $9 a month or $90 a year.",
      },
    ],
  }),
  component: PricingPage,
});

type Interval = "month" | "year";

function PricingPage() {
  const { user, billing, billingEnabled } = Route.useLoaderData();
  const [interval, setInterval] = useState<Interval>("year");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPro = billing?.plan === "pro";
  const canUpgrade = Boolean(billing?.canUpgrade);

  // Same contract as the account panel: POST returns { url }, and the session
  // cookie has to be sent explicitly on a fetch from a hydrated island.
  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          price: interval === "year" ? "pro_yearly" : "pro_monthly",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setPending(false);
        return;
      }
      // Leaving the app — keep `pending` true so the button cannot fire twice.
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  return (
    <MarketingShell
      current="pricing"
      account={user ? { name: user.name, email: user.email } : undefined}
    >
      <div className="wrap page-head">
        <p className="eyebrow enter enter--1">Pricing</p>
        <h1 className="enter enter--2">Optional dashboard plans</h1>
        <p className="lede enter enter--3">
          The Mend extension is free and open source, and always will be. Plans
          apply only to the optional cloud dashboard, where saved audits live.
        </p>
      </div>

      <section className="wrap section--tight" aria-labelledby="plans-h">
        <h2 id="plans-h" className="visually-hidden">
          Plans
        </h2>

        <fieldset className="interval-toggle">
          <legend>Billing period</legend>
          <label>
            <input
              type="radio"
              name="interval"
              value="year"
              checked={interval === "year"}
              onChange={() => setInterval("year")}
            />
            <span>
              Yearly <span className="muted">(2 months free)</span>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="interval"
              value="month"
              checked={interval === "month"}
              onChange={() => setInterval("month")}
            />
            <span>Monthly</span>
          </label>
        </fieldset>

        {error && (
          <p role="alert" className="pricing-error">
            {error}
          </p>
        )}

        <div className="pricing-grid reveal-group">
          <div className="price-card reveal">
            <h3>Free</h3>
            <p className="price">
              <strong>$0</strong>
            </p>
            <p className="price-card__lede">
              Everything the extension does, plus a dashboard for the runs you
              choose to save.
            </p>
            <ul className="plan-list">
              <li>The full extension — unlimited scans, offline, forever</li>
              <li>30 days of audit history</li>
              <li>Up to 200 saved audits</li>
              <li>3 API keys</li>
              <li>60 saved runs per minute</li>
              <li>JSON export of everything stored</li>
            </ul>
            {user ? (
              <Link className="btn btn--ghost" to="/dashboard">
                Go to your dashboard
              </Link>
            ) : (
              <Link className="btn btn--ghost" to="/signup">
                Create a free account
              </Link>
            )}
          </div>

          <div className="price-card price-card--featured reveal">
            <p className="price-card__flag">Most complete</p>
            <h3>Pro</h3>
            <p className="price">
              <strong>{interval === "year" ? "$90" : "$9"}</strong>
              <span className="price__per">
                {interval === "year" ? "/year" : "/month"}
              </span>
            </p>
            <p className="price-card__lede">
              Room to track a real site over time — longer history and far more
              headroom in the cloud dashboard.
            </p>
            <ul className="plan-list">
              <li>Everything in Free</li>
              <li>2 years of audit history</li>
              <li>Up to 50,000 saved audits</li>
              <li>20 API keys</li>
              <li>300 saved runs per minute</li>
              <li>Billing portal — invoices, card changes, cancel anytime</li>
            </ul>
            {isPro ? (
              <Link className="btn btn--primary" to="/account">
                Manage on your account
              </Link>
            ) : user ? (
              canUpgrade ? (
                <button
                  className="btn btn--primary"
                  type="button"
                  disabled={pending}
                  onClick={startCheckout}
                >
                  {pending ? "Starting…" : "Upgrade to Pro"}
                </button>
              ) : (
                <p className="muted price-card__note">
                  Upgrades aren&apos;t available right now.
                </p>
              )
            ) : (
              <>
                <Link className="btn btn--primary" to="/signup">
                  Get started
                </Link>
                <p className="muted price-card__note">
                  Create a free account, then return here to upgrade.
                </p>
              </>
            )}
          </div>

          <div className="price-card price-card--soon reveal">
            <p className="price-card__flag">Coming soon</p>
            <h3>Team</h3>
            <p className="price">
              <strong>—</strong>
            </p>
            <p className="price-card__lede">
              Shared dashboards for a whole site, with audits pooled across
              everyone working on it. Not available yet.
            </p>
            <ul className="plan-list">
              <li>Everything in Pro</li>
              <li>Shared workspace</li>
              <li>Per-seat billing</li>
            </ul>
            <p className="muted price-card__note">
              Want this? Tell us on{" "}
              <Link to="/support">the support page</Link>.
            </p>
          </div>
        </div>

        {!billingEnabled && (
          <p className="muted pricing-foot">
            Pro checkout is not open yet — the Free dashboard is available now.
          </p>
        )}
      </section>

      <section className="wrap section--tight" aria-labelledby="pricing-faq-h">
        <h2 id="pricing-faq-h" style={{ marginBottom: "1.2rem" }}>
          Questions
        </h2>
        <div className="faq reveal-group">
          <details className="reveal">
            <summary>
              Is the extension itself ever paid?{" "}
              <span className="q-icon" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="faq__body">
              <p>
                No. Scanning happens on your device, and it is free and open
                source under the MIT license — no account required, no limits.
                Plans only cover the optional cloud dashboard that stores runs
                you deliberately save.
              </p>
            </div>
          </details>
          <details className="reveal">
            <summary>
              Can I cancel whenever I like?{" "}
              <span className="q-icon" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="faq__body">
              <p>
                Yes. Cancel in the billing portal from your account page and Pro
                stays active until the end of the period you already paid for,
                then the account returns to Free.
              </p>
            </div>
          </details>
          <details className="reveal">
            <summary>
              What happens to my audits if I downgrade?{" "}
              <span className="q-icon" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="faq__body">
              <p>
                Free keeps 30 days of history and up to 200 saved audits, so
                older runs beyond that fall out of the dashboard. Export
                everything as JSON from your account page first — that works on
                every plan.
              </p>
            </div>
          </details>
          <details className="reveal">
            <summary>
              Who handles payment?{" "}
              <span className="q-icon" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="faq__body">
              <p>
                Stripe. Card details go straight to Stripe&apos;s hosted
                checkout and never touch Mend&apos;s servers — see the{" "}
                <Link to="/privacy">privacy policy</Link> for exactly what is
                shared.
              </p>
            </div>
          </details>
        </div>
      </section>
    </MarketingShell>
  );
}
