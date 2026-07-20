import { useState } from "react";
import type { BillingSummary } from "@/lib/account-fns";

// Plan + subscription panel on the account page. Everything it shows comes from
// the DB mirror the Stripe webhooks maintain (plan 038) — never from a
// Checkout redirect's query string.
//
// Copy rule: Pro sells the *cloud dashboard*. The extension's scanner is free
// and offline forever, so nothing here may suggest scanning is paid.
export function BillingPanel({ billing }: { billing: BillingSummary }) {
  const [interval, setInterval] = useState<"month" | "year">("year");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both Checkout and the Customer Portal answer with { url } and expect the
  // session cookie, which fetch omits by default on a same-origin POST issued
  // from a hydrated island — hence credentials: "include".
  async function go(path: string, body?: Record<string, string>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
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
      // Leaving the app entirely, so `pending` stays true — the button must not
      // re-enable behind the navigation and allow a second Checkout session.
      window.location.href = data.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  const isPro = billing.plan === "pro";
  const periodEnd = billing.currentPeriodEnd
    ? formatDate(billing.currentPeriodEnd)
    : null;

  return (
    <section className="panel" aria-labelledby="billing-h">
      <div className="panel__head">
        <h2 id="billing-h">Plan</h2>
        <span
          className={`plan-badge ${isPro ? "plan-badge--pro" : ""}`}
          data-testid="plan-badge"
        >
          {isPro ? "Pro" : "Free"}
        </span>
      </div>
      <div className="panel__body">
        {error && (
          <p role="alert" style={{ color: "var(--sev-critical)", fontWeight: 600 }}>
            {error}
          </p>
        )}

        {billing.status === "past_due" && (
          <div className="callout callout--warn" style={{ marginTop: 0 }}>
            <p>
              <strong>Payment failed.</strong> Update your card in the billing
              portal to keep Pro. We&apos;ll retry in the meantime.
            </p>
          </div>
        )}

        <p className="muted" style={{ marginTop: 0, maxWidth: "60ch" }}>
          {isPro ? (
            billing.cancelAtPeriodEnd && periodEnd ? (
              <>
                Pro until <strong>{periodEnd}</strong>, then your account returns
                to Free. You keep the dashboard until then.
              </>
            ) : periodEnd ? (
              <>
                Pro — renews {billing.interval === "year" ? "yearly" : "monthly"}{" "}
                on <strong>{periodEnd}</strong>.
              </>
            ) : (
              <>Pro dashboard is active.</>
            )
          ) : (
            <>
              You&apos;re on Free. The Mend extension scans pages for free,
              always — Pro adds longer history and more room in the cloud
              dashboard.
            </>
          )}
        </p>

        {!isPro && billing.freeLimitsEnforced && (
          <div className="callout" style={{ margin: "0 0 1.2rem" }}>
            <p>
              <strong>What Free includes.</strong> 30 days of audit history, up
              to 200 saved audits, and 3 API keys.
            </p>
          </div>
        )}

        {billing.canUpgrade && (
          <div className="upgrade">
            <fieldset className="upgrade__choice">
              <legend>Billing period</legend>
              <label>
                <input
                  type="radio"
                  name="billing-interval"
                  value="year"
                  checked={interval === "year"}
                  onChange={() => setInterval("year")}
                />
                <span>
                  Yearly — <strong>$90</strong>/year{" "}
                  <span className="muted">(2 months free)</span>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="billing-interval"
                  value="month"
                  checked={interval === "month"}
                  onChange={() => setInterval("month")}
                />
                <span>
                  Monthly — <strong>$9</strong>/month
                </span>
              </label>
            </fieldset>
            <button
              className="btn btn--primary"
              type="button"
              disabled={pending}
              onClick={() =>
                go("/api/billing/checkout", {
                  price: interval === "year" ? "pro_yearly" : "pro_monthly",
                })
              }
            >
              {pending ? "Starting…" : "Upgrade to Pro"}
            </button>
          </div>
        )}

        {billing.canManage && (
          <div style={{ marginTop: billing.canUpgrade ? "1rem" : 0 }}>
            <button
              className="btn btn--ghost"
              type="button"
              disabled={pending}
              onClick={() => go("/api/billing/portal")}
            >
              {pending ? "Opening…" : "Manage subscription"}
            </button>
            <p className="muted" style={{ margin: ".5rem 0 0", fontSize: ".92rem" }}>
              Change your card, download invoices, or cancel — handled by Stripe.
            </p>
          </div>
        )}

        {!billing.billingEnabled && !isPro && (
          <p className="muted" style={{ margin: 0 }}>
            Upgrades aren&apos;t available right now.
          </p>
        )}
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
