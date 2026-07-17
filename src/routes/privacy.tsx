import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { site } from "@/lib/site";
import { getSessionUser } from "@/lib/session-fns";

export const Route = createFileRoute("/privacy")({
  loader: () => getSessionUser(),
  head: () => ({
    meta: [
      { title: "Privacy Policy — Mend" },
      {
        name: "description",
        content:
          "What Mend does and does not do with your information. Short version: nothing leaves your device.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const user = Route.useLoaderData();
  return (
    <MarketingShell
      current="privacy"
      account={user ? { name: user.name, email: user.email } : undefined}
    >
      <div className="wrap page-head">
        <p className="eyebrow enter enter--1">Legal</p>
        <h1 className="enter enter--2">Privacy Policy</h1>
        <p className="lede enter enter--3">The short version: nothing leaves your device.</p>
        <p className="page-meta enter enter--4">Effective date: {site.privacyEffectiveDate}</p>
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
          <div className="callout reveal">
            <p>
              <strong>Nothing, unless you turn on sync.</strong> By default Mend
              does not collect, transmit, sell, or share any data, and makes no
              network requests of any kind. Your pages, audit results, and
              settings never leave your device. There is no analytics, no
              telemetry, and no remote server. This stays true until you take the
              two deliberate steps below.
            </p>
          </div>

          <h2>Optional account sync</h2>
          <p>
            Mend can optionally save your audits to a dashboard tied to an
            account, so you can track issues across a site and over time. This is{" "}
            <strong>off by default</strong> and never happens automatically. It
            only sends data after you both connect an account (by pasting a key
            into the extension) and choose to save a specific audit run.
          </p>
          <p>
            When you save a run, Mend transmits that run to the dashboard: the
            page&apos;s URL and title, and for each issue a CSS selector and a
            short HTML snippet of the failing element. Those snippets can contain
            real page content. Nothing else is sent, and runs you don&apos;t save
            stay on your device. You can disconnect at any time by turning sync
            off in the extension and revoking the key from your account page,
            which stops all further requests.
          </p>

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
