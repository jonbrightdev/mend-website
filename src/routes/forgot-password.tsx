import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Mend" },
      {
        name: "description",
        content:
          "Forgotten your Mend password? Enter your email and we'll send you a link to set a new one.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <MarketingShell current="login">
      <section className="section auth" aria-labelledby="auth-h">
        <div className="wrap auth__grid">
          <div className="auth__pitch">
            <p className="eyebrow">Account recovery</p>
            <h1 id="auth-h">Locked out? Let&apos;s fix that.</h1>
            <p className="lede">
              We&apos;ll email you a link to set a new password. Your audits and
              API keys stay exactly as you left them.
            </p>

            <div className="reassure">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2.5 4 6v6c0 5 3.4 8 8 9.5 4.6-1.5 8-4.5 8-9.5V6l-8-3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M8.6 12.2 11 14.6 15.6 9.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p>
                <strong>The link expires in an hour and works once.</strong>{" "}
                Using it sets your new password and immediately spends the link.
              </p>
            </div>
          </div>

          <div className="auth-card">
            <ForgotPasswordForm />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
