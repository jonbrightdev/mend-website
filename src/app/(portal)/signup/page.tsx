import type { Metadata } from "next";
import { MarketingShell } from "@/components/MarketingShell";
import { Pip } from "@/components/Pip";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Create a free Mend account to save and aggregate your accessibility audits. The extension works without an account — signing in is optional and your data only syncs when you choose.",
};

export default function SignupPage() {
  return (
    <MarketingShell current="signup">
      <section className="section auth" aria-labelledby="auth-h">
        <div className="wrap auth__grid">
          <div className="auth__pitch">
            <div className="auth__pip">
              <Pip
                variant="face"
                titleId="pipSignupT"
                descId="pipSignupD"
                title="Pip, the Mend inspector"
                desc="A small round character with big round glasses, holding a checklist clipboard."
              />
              <p>“Let&apos;s keep your audits in one place.”</p>
            </div>

            <p className="eyebrow">Optional account</p>
            <h1 id="auth-h">Create an account, keep every audit.</h1>
            <p className="lede">
              Mend already finds and fixes issues one page at a time. An account
              adds memory: a running record across pages and runs.
            </p>

            <ul className="value-list">
              <li>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12.5 10 17.5 19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  <b>Save &amp; aggregate audits</b>Every scan adds to one picture
                  of your site&apos;s health.
                </span>
              </li>
              <li>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 19V5M4 19h16M8 16l4-5 3 3 5-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  <b>Track across a site and over time</b>Spot regressions between
                  runs, scoped to any URL.
                </span>
              </li>
              <li>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18M7 12h14M11 18h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                <span>
                  <b>Filter &amp; triage by page</b>Cut to what matters by impact
                  level and rule.
                </span>
              </li>
            </ul>

            <div className="reassure">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2.5 4 6v6c0 5 3.4 8 8 9.5 4.6-1.5 8-4.5 8-9.5V6l-8-3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M8.6 12.2 11 14.6 15.6 9.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p>
                <strong>No account? Mend still works.</strong> The extension runs
                entirely on your machine. Audits sync only when you&apos;re signed
                in — and never before.
              </p>
            </div>
          </div>

          <div className="auth-card">
            <SignupForm />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
