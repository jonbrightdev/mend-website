import { createFileRoute } from "@tanstack/react-router";
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
          "Manage the keys that connect the Mend extension to your dashboard.",
      },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user, keys } = Route.useLoaderData();
  return (
    <MarketingShell
      current="account"
      account={{ name: user.name, email: user.email }}
    >
      <div className="wrap page-head">
        <p className="eyebrow">Account</p>
        <h1>{user.name}</h1>
        <p className="lede">{user.email}</p>
      </div>
      <AccountClient initialKeys={keys} />
    </MarketingShell>
  );
}
