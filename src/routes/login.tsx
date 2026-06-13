import { createFileRoute, redirect } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/lib/session-fns";

export const Route = createFileRoute("/login")({
  // Already signed in? There's nothing to log into — go to the dashboard.
  beforeLoad: async () => {
    if (await getSessionUser()) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Log in — Mend" },
      {
        name: "description",
        content:
          "Log in to save and aggregate your accessibility audits across pages and over time. The Mend extension works without an account — signing in is optional.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  return (
    <MarketingShell current="login">
      <section className="section auth" aria-labelledby="auth-h">
        <div className="wrap auth__grid">
          <div className="auth__pitch">
            <p className="eyebrow">Optional account</p>
            <h1 id="auth-h">Save your audits. See the whole site.</h1>
            <p className="lede">
              Signing in lets Mend keep your audits together — so you can track
              issues across every page and watch them go down over time.
            </p>

            <ul className="value-list">
              <li>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  <b>Save &amp; aggregate audits</b>One running record instead of
                  one page at a time.
                </span>
              </li>
              <li>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 19V5M4 19h16M8 16l4-5 3 3 5-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  <b>Track across a site and over time</b>Catch regressions
                  between runs, scoped to any URL.
                </span>
              </li>
              <li>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18M7 12h14M11 18h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                <span>
                  <b>Filter &amp; triage by page</b>Sort the noise by impact level
                  and rule, across URLs.
                </span>
              </li>
            </ul>

            <div className="reassure">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2.5 4 6v6c0 5 3.4 8 8 9.5 4.6-1.5 8-4.5 8-9.5V6l-8-3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M8.6 12.2 11 14.6 15.6 9.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p>
                <strong>The extension works fully without an account.</strong>{" "}
                Audits stay on your machine and only sync when you choose to sign
                in.
              </p>
            </div>
          </div>

          <div className="auth-card">
            <LoginForm />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
