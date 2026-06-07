import type { Metadata } from "next";
import { MarketingShell } from "@/components/MarketingShell";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Mend does and does not do with your information. Short version: nothing leaves your device.",
};

export default function PrivacyPage() {
  return (
    <MarketingShell current="privacy">
      <div className="wrap page-head">
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="lede">The short version: nothing leaves your device.</p>
        <p className="page-meta">Effective date: {site.privacyEffectiveDate}</p>
      </div>

      <div className="wrap section--tight">
        <div className="prose">
          <p>
            Mend is a browser extension that audits the web page you are viewing
            for accessibility issues. This policy explains what Mend does and
            does not do with your information.
          </p>

          <h2>What Mend accesses</h2>
          <p>
            When you run an audit, and only then, Mend reads the content and
            structure of the page in the active tab so it can analyze that page
            for accessibility problems. It accesses a page only when you invoke
            it, and has no standing access to any website. The analysis happens
            entirely inside your browser, on your device.
          </p>

          <h2>What Mend collects</h2>
          <div className="callout">
            <p>
              <strong>Nothing.</strong> Mend does not collect, transmit, sell, or
              share any data. It makes no network requests of any kind. Your
              pages, audit results, and settings never leave your device. There
              is no analytics, no telemetry, and no remote server.
            </p>
          </div>

          <h2>What Mend stores</h2>
          <p>
            Mend stores your preferences locally in your browser, and temporarily
            caches the most recent audit for each tab during your browsing
            session. All of it stays on your device and is removed when you clear
            the extension&apos;s data or uninstall it.
          </p>

          <h2>Third parties</h2>
          <p>Mend uses no third-party services and shares data with no one.</p>

          <h2>Changes</h2>
          <p>
            If this policy changes, the updated version will be posted here with
            a new effective date.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about privacy? Reach us at{" "}
            {site.contactEmail ? (
              <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            ) : (
              <a href={site.githubIssuesUrl}>GitHub issues</a>
            )}
            .
          </p>
        </div>
      </div>
    </MarketingShell>
  );
}
