import { Link } from "@tanstack/react-router";
import { BrandMark } from "./BrandMark";
import { SignOutButton } from "./SignOutButton";
import { site } from "@/lib/site";

export type NavPage =
  | "home"
  | "pricing"
  | "privacy"
  | "support"
  | "login"
  | "signup"
  | "dashboard"
  | "account";

type Account = { name: string; email: string };

// Public site header. `current` drives aria-current on the active nav item so
// the component stays a server component (no usePathname, no client JS). When
// `account` is provided, the trailing "Log in" link becomes the signed-in name
// plus a Sign out control.
export function SiteHeader({
  current,
  account,
}: {
  current: NavPage;
  account?: Account;
}) {
  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link className="brand" to="/" aria-label="Mend — home">
          <span className="brand__mark" aria-hidden="true">
            <BrandMark size={34} />
          </span>
          <span>Mend</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link to="/" aria-current={current === "home" ? "page" : undefined}>
            Home
          </Link>
          <Link
            to="/pricing"
            aria-current={current === "pricing" ? "page" : undefined}
          >
            Pricing
          </Link>
          <Link
            to="/privacy"
            aria-current={current === "privacy" ? "page" : undefined}
          >
            Privacy
          </Link>
          <Link
            to="/support"
            aria-current={current === "support" ? "page" : undefined}
          >
            Support
          </Link>
          <a href={site.githubUrl}>GitHub</a>
          {account ? (
            <>
              <Link
                to="/dashboard"
                aria-current={current === "dashboard" ? "page" : undefined}
              >
                Dashboard
              </Link>
              <Link
                to="/account"
                aria-current={current === "account" ? "page" : undefined}
              >
                {account.name}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              to="/login"
              aria-current={current === "login" ? "page" : undefined}
            >
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
