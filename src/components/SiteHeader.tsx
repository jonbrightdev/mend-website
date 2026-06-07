import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { SignOutButton } from "./SignOutButton";
import { site } from "@/lib/site";

export type NavPage =
  | "home"
  | "privacy"
  | "support"
  | "login"
  | "signup"
  | "dashboard";

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
          {account ? (
            <>
              <span
                style={{
                  padding: "0 .35rem",
                  color: "var(--muted)",
                  fontWeight: 550,
                }}
              >
                {account.name}
              </span>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
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
