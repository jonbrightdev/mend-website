import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { AccountClient } from "@/components/AccountClient";
import { fetchAccount } from "@/lib/account-fns";

export const Route = createFileRoute("/account")({
  loader: () => fetchAccount(),
  head: () => ({
    meta: [
      { title: "Account — Mend" },
      {
        name: "description",
        content:
          "Manage your plan and the keys that connect the Mend extension to your dashboard.",
      },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user, keys, hasPassword, keyQuota, billing } = Route.useLoaderData();
  return (
    <MarketingShell
      current="account"
      account={{ name: user.name, email: user.email }}
    >
      <div className="wrap app-main">
        <div className="app-head">
          <div>
            <p className="eyebrow">Account</p>
            <h1>{user.name}</h1>
            <p className="app-head__meta">{user.email}</p>
          </div>
          <Link className="btn btn--ghost" to="/dashboard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to dashboard
          </Link>
        </div>
        <AccountClient
          initialKeys={keys}
          hasPassword={hasPassword}
          keyQuota={keyQuota}
          billing={billing}
        />
      </div>
    </MarketingShell>
  );
}
