import type { ReactNode } from "react";
import { SiteHeader, type NavPage } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

// Wraps the shared chrome so each page owns its `current` nav state. The single
// <main id="main"> is the skip-link target. Pass `account` on signed-in pages to
// swap the "Log in" link for the user's name and a Sign out control.
export function MarketingShell({
  current,
  account,
  children,
}: {
  current: NavPage;
  account?: { name: string; email: string };
  children: ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SiteHeader current={current} account={account} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
