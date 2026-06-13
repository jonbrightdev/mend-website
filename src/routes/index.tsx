import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { BrandMark } from "@/components/BrandMark";
import { Pip } from "@/components/Pip";
import { site } from "@/lib/site";
import { getSessionUser } from "@/lib/session-fns";

export const Route = createFileRoute("/")({
  loader: () => getSessionUser(),
  component: HomePage,
});

function HomePage() {
  const user = Route.useLoaderData();
  return (
    <MarketingShell
      current="home"
      account={user ? { name: user.name, email: user.email } : undefined}
    >
      {/* HERO */}
      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">Accessibility auditor for Chrome</p>
            <h1 id="hero-h">
              Find what&apos;s broken on your page, and exactly how to fix it.
            </h1>
            <p className="hero__sub">
              A friendly accessibility auditor for Chrome that scans the active
              tab against WCAG and shows you what&apos;s wrong, where it lives,
              and how to fix it — in plain language.
            </p>
            <div className="hero__cta">
              <a className="btn btn--primary btn--lg" href={site.chromeStoreUrl}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9.2" stroke="#fff" strokeWidth="1.8" />
                  <circle cx="12" cy="12" r="3.4" fill="#fff" />
                  <path
                    d="M12 2.8 v6.2 M20 7.6 l-5.2 3 M5.6 19 l3.4-5.6"
                    stroke="#fff"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                Add to Chrome
              </a>
              <a className="btn btn--ghost btn--lg" href={site.githubUrl}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 1.5A10.5 10.5 0 0 0 8.7 22c.5.1.7-.2.7-.5v-1.8c-2.9.6-3.5-1.4-3.5-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.3-.3-4.7-1.1-4.7-5a4 4 0 0 1 1-2.7c-.1-.3-.5-1.4.1-2.8 0 0 .9-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .6 1.4.2 2.5.1 2.8a4 4 0 0 1 1 2.7c0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5Z" />
                </svg>
                View on GitHub
              </a>
            </div>
            <p className="hero__note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 2.5 4 6v6c0 5 3.4 8 8 9.5 4.6-1.5 8-4.5 8-9.5V6l-8-3.5Z"
                  stroke="#6c6555"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path
                  d="M8.6 12.2 11 14.6 15.6 9.6"
                  stroke="#6c6555"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Free &amp; open source · Nothing leaves your machine
            </p>
          </div>

          <div className="hero__art">
            <div className="hero__art-inner">
              <Pip
                className="pip hero__pip"
                titleId="pipT"
                descId="pipD"
                title="Pip, the Mend inspector"
                desc="A small round character with big round glasses, holding a clipboard with a checklist."
              />

              <div
                className="panel-mock panel-mock--float"
                role="img"
                aria-label="Example of the Mend side panel: a critical image-alt issue, showing the fix first."
              >
                <div className="panel-mock__bar">
                  <span className="brand__mark" aria-hidden="true">
                    <BrandMark size={20} />
                  </span>
                  <span>3 issues</span>
                  <span className="pass-pill">
                    <span className="dot" style={{ background: "#3c5a23" }}></span>Done
                  </span>
                </div>
                <div className="panel-issue">
                  <div className="panel-issue__top">
                    <span className="dot dot--critical" aria-hidden="true"></span>
                    <span className="panel-issue__sev panel-issue__sev--critical">
                      Critical
                    </span>
                    <span className="panel-issue__rule">image-alt</span>
                  </div>
                  <p className="panel-issue__title">Image has no text alternative</p>
                  <p className="panel-issue__fix">
                    <b>Fix:</b> add <code>alt=&quot;…&quot;</code> describing the image.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIFFERENTIATORS */}
      <section className="section" aria-labelledby="diff-h">
        <div className="wrap">
          <p className="eyebrow">Why Mend</p>
          <h2 id="diff-h">What makes Mend different</h2>
          <p className="lede">
            Most scanners hand you a wall of jargon. Mend hands you the fix.
          </p>

          <div className="feature-grid" style={{ marginTop: "2rem" }}>
            <div className="feature">
              <span className="feature__num" aria-hidden="true">1</span>
              <h3>The fix comes first</h3>
              <p>
                Every issue opens with what to change — not a lecture. The
                explanation is there if you want it, underneath.
              </p>
            </div>
            <div className="feature">
              <span className="feature__num" aria-hidden="true">2</span>
              <h3>Plain-language docs, written by hand</h3>
              <p>
                Each issue has its own explanation and a before/after code
                example, not raw scanner jargon.
              </p>
              <div className="codeflip" aria-hidden="true">
                <div className="codeflip__row codeflip__row--before">
                  <span className="codeflip__tag">Before</span>
                  <span>{'<img src="logo.png">'}</span>
                </div>
                <div className="codeflip__row codeflip__row--after">
                  <span className="codeflip__tag">After</span>
                  <span>{'<img src="logo.png" alt="Mend logo">'}</span>
                </div>
              </div>
            </div>
            <div className="feature">
              <span className="feature__num" aria-hidden="true">3</span>
              <h3>Everything runs on your machine</h3>
              <p>
                No network requests, no accounts, no API keys. Your pages and
                results never leave the browser.
              </p>
            </div>
            <div className="feature">
              <span className="feature__num" aria-hidden="true">4</span>
              <h3>It passes its own audit</h3>
              <p>We hold the panel to the same standard it checks for.</p>
              <div className="feature__extra">
                <span className="pass-pill">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 12.5 10 17.5 19 7"
                      stroke="#3c5a23"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  100 on Lighthouse accessibility
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section
        id="how-it-works"
        className="section section--tight"
        aria-labelledby="how-h"
        style={{ background: "var(--surface)", borderBlock: "1px solid var(--border)" }}
      >
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2 id="how-h">Three steps, then a to-do list</h2>

          <ol
            className="steps"
            style={{ marginTop: "2rem", listStyle: "none", padding: 0 }}
          >
            <li className="step">
              <span className="step__n">Step 01</span>
              <h3>Open the side panel</h3>
              <p>
                Click the Mend icon in your toolbar to dock the panel beside any
                page.
              </p>
              <div className="step__demo">
                <span className="mini-btn" aria-hidden="true">
                  <span className="brand__mark">
                    <BrandMark size={16} />
                  </span>
                  Mend
                </span>
              </div>
            </li>
            <li className="step">
              <span className="step__n">Step 02</span>
              <h3>Click Run audit</h3>
              <p>
                Mend reads the active tab on your command and checks it against
                the WCAG rules you&apos;ve enabled.
              </p>
              <div className="step__demo">
                <span className="mini-btn mini-btn--accent" aria-hidden="true">
                  Run audit
                </span>
              </div>
            </li>
            <li className="step">
              <span className="step__n">Step 03</span>
              <h3>Get a fix for each issue</h3>
              <p>
                Issues are grouped by rule and sorted by severity, then page
                order — each with a fix and a button to find it on the page.
              </p>
              <div className="step__demo">
                <span className="mini-btn" aria-hidden="true">
                  <span className="dot dot--critical"></span>Critical
                </span>
                <span className="mini-btn" aria-hidden="true">Highlight on page</span>
              </div>
            </li>
          </ol>
        </div>
      </section>
    </MarketingShell>
  );
}
