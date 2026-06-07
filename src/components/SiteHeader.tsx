import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { site } from "@/lib/site";

export type MarketingPage = "home" | "privacy" | "support";

// Public site header. `current` drives aria-current on the active nav item so
// the component stays a server component (no usePathname, no client JS).
export function SiteHeader({ current }: { current: MarketingPage }) {
  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link className="brand" href="/" aria-label="Mend — home">
          <span className="brand__mark" aria-hidden="true">
            <BrandMark size={34} />
          </span>
          <span>Mend</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/" aria-current={current === "home" ? "page" : undefined}>
            Home
          </Link>
          <Link
            href="/privacy"
            aria-current={current === "privacy" ? "page" : undefined}
          >
            Privacy
          </Link>
          <Link
            href="/support"
            aria-current={current === "support" ? "page" : undefined}
          >
            Support
          </Link>
          <a href={site.githubUrl}>GitHub</a>
          <Link href="/login">Log in</Link>
        </nav>
      </div>
    </header>
  );
}
