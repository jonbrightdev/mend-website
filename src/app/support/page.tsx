import type { Metadata } from "next";
import { MarketingShell } from "@/components/MarketingShell";
import { Pip } from "@/components/Pip";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with Mend. Report bugs and request features on GitHub Issues, or read the FAQ.",
};

export default function SupportPage() {
  return (
    <MarketingShell current="support">
      <div className="wrap page-head">
        <p className="eyebrow">Help</p>
        <h1>Support</h1>
        <p className="lede">
          The best way to report a bug or request a feature is GitHub Issues — it&apos;s
          where development happens, in the open.
        </p>
        <p style={{ marginTop: "1.3rem" }}>
          <a className="btn btn--primary btn--lg" href={site.githubIssuesUrl}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
              <path d="M12 1.5A10.5 10.5 0 0 0 8.7 22c.5.1.7-.2.7-.5v-1.8c-2.9.6-3.5-1.4-3.5-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.3-.3-4.7-1.1-4.7-5a4 4 0 0 1 1-2.7c-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .6 1.4.2 2.5.1 2.8a4 4 0 0 1 1 2.7c0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5Z" />
            </svg>
            Open a GitHub issue
          </a>
        </p>
      </div>

      <section className="wrap section--tight" aria-labelledby="faq-h">
        <h2 id="faq-h" style={{ marginBottom: "1.2rem" }}>
          Frequently asked questions
        </h2>
        <div className="faq">
          <details>
            <summary>
              Does Mend send my data anywhere?{" "}
              <span className="q-icon" aria-hidden="true">+</span>
            </summary>
            <div className="faq__body">
              <p>
                No. Mend runs entirely on your device and makes no network
                requests. You can confirm this in your browser&apos;s network tab
                while running an audit.
              </p>
            </div>
          </details>
          <details>
            <summary>
              Why does it ask for permission per tab?{" "}
              <span className="q-icon" aria-hidden="true">+</span>
            </summary>
            <div className="faq__body">
              <p>
                Mend uses Chrome&apos;s activeTab model, so it can read a page only
                on a tab where you&apos;ve actively invoked it. If an audit says it
                needs permission, click the Mend icon in your toolbar on that tab,
                then run it again.
              </p>
            </div>
          </details>
          <details>
            <summary>
              Which rules does it check?{" "}
              <span className="q-icon" aria-hidden="true">+</span>
            </summary>
            <div className="faq__body">
              <p>
                Mend checks against WCAG 2.0, 2.1, and 2.2 at level A, AA, or AAA —
                configurable in settings.
              </p>
            </div>
          </details>
          <details>
            <summary>
              Is it really free?{" "}
              <span className="q-icon" aria-hidden="true">+</span>
            </summary>
            <div className="faq__body">
              <p>Yes — free and open source under the MIT license.</p>
            </div>
          </details>
        </div>

        <div className="support-contact">
          <Pip
            className="pip"
            titleId="pipT2"
            descId="pipD2"
            title="Pip, the Mend inspector, waving"
            desc="The round Mend mascot with round glasses and a clipboard, here to help."
          />
          <div>
            <h2>Still stuck?</h2>
            <p>
              {site.contactEmail ? (
                <>
                  If GitHub isn&apos;t your thing, email us at{" "}
                  <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> and
                  Pip will take a look.
                </>
              ) : (
                <>
                  If GitHub isn&apos;t your thing,{" "}
                  <a href={site.githubIssuesUrl}>open a GitHub issue</a> and Pip
                  will take a look.
                </>
              )}
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
