import { Link } from "@tanstack/react-router";
import { BrandMark } from "./BrandMark";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__band">
        <div className="site-footer__lead">
          <span className="brand__mark" aria-hidden="true">
            <BrandMark size={40} />
          </span>
          <p>
            <strong>Free and open source.</strong> Mend is released under the MIT
            license — read the code, file an issue, or send a patch.
          </p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <a href={site.githubUrl}>GitHub</a>
          <Link to="/privacy">Privacy</Link>
          <Link to="/support">Support</Link>
        </nav>
      </div>
      <div className="wrap site-footer__fine">
        <p style={{ margin: 0 }}>
          © <span>2026</span> Mend · MIT License · Built to pass its own audit.
        </p>
      </div>
    </footer>
  );
}
