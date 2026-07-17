import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const Route = createFileRoute("/reset-password")({
  // Better Auth redirects here with ?token= on success, or ?error=INVALID_TOKEN
  // when the link was expired or already spent. Both are optional so a bare
  // /reset-password renders the dead-end screen rather than throwing.
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Set a new password — Mend" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useSearch();

  return (
    <MarketingShell current="login">
      <section className="section auth" aria-labelledby="auth-h">
        <div className="wrap auth__grid">
          <div className="auth__pitch">
            <p className="eyebrow">Account recovery</p>
            <h1 id="auth-h">One password away from your audits.</h1>
            <p className="lede">
              Set a new password and we&apos;ll take you straight to the login
              page. Nothing else about your account changes.
            </p>
          </div>

          <div className="auth-card">
            <ResetPasswordForm token={token} />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
