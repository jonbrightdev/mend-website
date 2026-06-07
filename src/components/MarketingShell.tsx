import type { ReactNode } from "react";
import { SiteHeader, type MarketingPage } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

// Wraps the public-facing chrome so each marketing page owns its `current`
// state for the nav. The single <main id="main"> is the skip-link target.
export function MarketingShell({
  current,
  children,
}: {
  current: MarketingPage;
  children: ReactNode;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <SiteHeader current={current} />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
