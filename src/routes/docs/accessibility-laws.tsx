import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { DocsArticle } from "@/components/DocsArticle";
import { getSessionUser } from "@/lib/session-fns";

export const Route = createFileRoute("/docs/accessibility-laws")({
  loader: () => getSessionUser(),
  head: () => ({
    meta: [
      { title: "Accessibility laws, explained — Mend" },
      {
        name: "description",
        content:
          "A plain-language tour of the rules that reference web accessibility — the ADA, Section 508, the EAA, EN 301 549, and the UK's regulations — and how they relate to WCAG.",
      },
    ],
  }),
  component: AccessibilityLawsPage,
});

// Every date, standard and threshold on this page was verified on 21 July 2026
// against primary sources: ada.gov and the Federal Register (ADA Title II and
// III), access-board.gov (Revised 508 Standards, E205.4), the European
// Commission's own EAA and digital-strategy pages (EAA, EN 301 549, the Web
// Accessibility Directive), gov.uk (PSBAR 2018), and ontario.ca (AODA).
//
// Two things moved since this guide was planned, and both are load-bearing:
//   1. A DOJ interim final rule effective 20 April 2026 extended BOTH ADA
//      Title II web compliance dates by a year, to 26 April 2027 and
//      26 April 2028. No Title II web deadline has passed yet.
//   2. EN 301 549 is still harmonised at v3.2.1, which references WCAG 2.1.
//      The WCAG 2.2 alignment (draft V4.1.0) is not yet cited in the OJ.
//
// This page decays faster than anything else on the site. Re-verify and bump
// lastReviewed whenever it is touched — at minimum when the remaining ADA
// deadlines pass and when EN 301 549 v4 is harmonised.
function AccessibilityLawsPage() {
  const user = Route.useLoaderData();
  return (
    <MarketingShell
      current="docs"
      account={user ? { name: user.name, email: user.email } : undefined}
    >
      <DocsArticle
        eyebrow="Guide"
        title="Accessibility laws and legal compliance"
        lede="Which rules actually require an accessible website, whom they bind, and which technical standard each one points at — described plainly, without the scare tactics this topic usually attracts."
        lastReviewed="21 July 2026"
      >
        <div className="wrap section--tight">
          <div className="prose">
            <div className="callout reveal">
              <p>
                <strong>This is not legal advice.</strong> It is general
                educational information about how accessibility law is
                structured. Laws, deadlines and referenced standards change —
                some of them recently and at short notice. For obligations
                specific to your organisation, your sector and your
                jurisdiction, consult a qualified lawyer. Where this guide and a
                primary source disagree, the primary source is right.
              </p>
            </div>

            <h2>Standards are not laws</h2>
            <p>
              The single most useful thing to understand first: <strong>WCAG is
              a technical standard, not a law.</strong> The Web Content
              Accessibility Guidelines are published by the W3C, an industry
              consortium with no power to compel anyone. Nobody is prosecuted
              for failing WCAG.
            </p>
            <p>
              Laws acquire their technical teeth by <em>pointing at</em> a
              standard. A statute says &ldquo;do not discriminate&rdquo;; a
              regulation made under it says &ldquo;and here is the measurable
              thing that counts&rdquo; — usually WCAG at a stated version and
              level, sometimes directly and sometimes through an intermediary
              standard like EN 301 549 or the Revised Section 508 Standards.
              This is why the same guidelines show up under every heading below
              at different versions: each law froze its reference at a different
              moment.
            </p>

            <h2>United States</h2>

            <h3>ADA Title II — state and local government</h3>
            <p>
              In April 2024 the Department of Justice published a final rule
              under Title II of the Americans with Disabilities Act setting a
              technical standard for the web content and mobile apps of state
              and local governments. The standard is{" "}
              <strong>WCAG 2.1 Level AA</strong>. It reaches state and local
              government bodies and their agencies and departments, plus special
              purpose districts, Amtrak and other commuter authorities.
            </p>
            <p>
              The compliance dates were <strong>extended in April 2026</strong>{" "}
              by a DOJ interim final rule, and are now:
            </p>
            <ul>
              <li>
                <strong>26 April 2027</strong> — public entities serving a total
                population of 50,000 or more.
              </li>
              <li>
                <strong>26 April 2028</strong> — public entities serving fewer
                than 50,000 people, and special district governments.
              </li>
            </ul>
            <div className="callout reveal">
              <p>
                Both dates moved back by a year, so as of this review{" "}
                <strong>no ADA Title II web deadline has passed</strong>. If you
                read something written before April 2026, it will very likely
                give you the older dates of 24 April 2026 and 26 April 2027.
                Check the current dates on{" "}
                <a href="https://www.ada.gov/resources/2024-03-08-web-rule/">
                  ada.gov
                </a>{" "}
                before relying on any figure, including this one.
              </p>
            </div>

            <h3>ADA Title III — businesses open to the public</h3>
            <p>
              Title III covers &ldquo;public accommodations&rdquo; — broadly,
              businesses serving the public. Here the picture is genuinely
              <em> unsettled</em>, and it is worth being precise about what is
              and is not established.
            </p>
            <p>
              What is established is the Department of Justice&apos;s position:
              it has consistently held that the ADA&apos;s requirements apply to
              the goods and services a public accommodation offers, including
              those offered on the web. What does <em>not</em> exist is a
              regulation setting out detailed technical standards for Title III
              web content. DOJ says so itself, and points to WCAG and the
              Section 508 Standards as helpful guidance rather than as codified
              requirements.
            </p>
            <p>
              The practical consequence is that courts have applied the ADA to
              websites unevenly, and the question of exactly what a business must
              do has not been settled by regulation. Anyone who tells you the law
              here is clear-cut — in either direction — is overstating it.
              Conformance with WCAG 2.1 or 2.2 Level AA is the widely used
              baseline, not because a rule names it for Title III, but because it
              is the standard everything else points at.
            </p>

            <h3>Section 508 — federal agencies and what they buy</h3>
            <p>
              Section 508 of the Rehabilitation Act requires federal agencies to
              make the information and communication technology they develop,
              procure, maintain or use accessible. The Revised 508 Standards set
              the technical bar at <strong>WCAG 2.0 Level A and Level AA</strong>{" "}
              — an older version than Title II&apos;s, because it was fixed
              earlier.
            </p>
            <p>
              The words to notice are <em>procure</em> and <em>use</em>. Section
              508 binds agencies, but its effect lands on their suppliers: if you
              sell software to the US federal government, your buyer needs to
              document conformance, which is why you get asked for an
              accessibility conformance report. That procurement pull is the
              subject of our{" "}
              <Link to="/docs/vpats-and-acrs">guide to VPATs and ACRs</Link>.
            </p>

            <h3>State law</h3>
            <p>
              Many US states have their own accessibility and disability
              discrimination laws, and state IT procurement policies frequently
              impose accessibility requirements of their own. These can reach
              organisations that federal law does not, and can set a higher bar
              than federal requirements. If you operate in a particular state,
              that state&apos;s own rules are worth checking specifically — a
              general guide is the wrong instrument for that question.
            </p>

            <h2>European Union</h2>
            <p>
              The EU has two instruments that matter here, aimed at different
              sectors.
            </p>
            <p>
              <strong>The European Accessibility Act</strong> (Directive (EU)
              2019/882) is the private-sector one, and the bigger change. It has
              applied since <strong>28 June 2025</strong>. It covers a defined
              list of products and services considered most important for people
              with disabilities: computing hardware and operating systems,
              self-service terminals including ATMs and ticketing machines,
              phones and telecommunications services, television equipment and
              audiovisual media services, elements of air, bus, rail and water
              passenger transport, consumer banking services, e-books, and{" "}
              <strong>e-commerce</strong>. That last category is why the EAA
              reached far more businesses than an accessibility directive
              normally would. Enforcement is by each member state under its own
              national transposition, so the penalties and the authority you deal
              with depend on the country. Microenterprises — under ten employees
              — providing services are exempt from its obligations.
            </p>
            <p>
              <strong>EN 301 549</strong> is the technical standard that
              accompanies it, and the mechanism is worth understanding: meeting
              the harmonised standard gives you a{" "}
              <em>presumption of conformity</em> with the legal requirements. You
              are not obliged to use it, but doing so is the well-lit path. The
              version currently harmonised — cited in the Official Journal since
              August 2021 — is <strong>v3.2.1, which is based on WCAG 2.1</strong>
              . A revision aligning it with WCAG 2.2 has been drafted but is not
              yet cited in the Official Journal, so WCAG 2.1 remains the operative
              reference for now.
            </p>
            <p>
              <strong>The Web Accessibility Directive</strong> (Directive (EU)
              2016/2102) is the older, public-sector one, transposed by member
              states from September 2018. Beyond the technical requirements it
              adds two obligations that are easy to overlook: every site and app
              needs a published <strong>accessibility statement</strong> setting
              out non-accessible content and alternatives, and a{" "}
              <strong>feedback mechanism</strong> so users can report barriers or
              request content in an accessible form. Member states monitor a
              sample of public sector sites and report to the Commission every
              three years.
            </p>

            <h2>United Kingdom</h2>
            <p>
              <strong>The Equality Act 2010</strong> is the general duty. Service
              providers must make <em>reasonable adjustments</em> so disabled
              people are not put at a substantial disadvantage, and this applies
              to services delivered through a website like any other. The Act
              names no technical standard and sets no deadline: reasonableness is
              assessed in context, which cuts both ways — it is more flexible
              than a fixed rule, and less predictable.
            </p>
            <p>
              <strong>The Public Sector Bodies (Websites and Mobile
              Applications) (No. 2) Accessibility Regulations 2018</strong>{" "}
              — PSBAR — are the specific ones. They bind public sector bodies,
              with exemptions for some organisations (non-government bodies that
              are not mostly publicly funded, public broadcasters) and partial
              exemptions for schools. Government guidance currently states the
              standard as <strong>WCAG 2.2 Level AA</strong> — the most recent
              WCAG version referenced by any of the regimes on this page. Like
              the EU directive it descends from, PSBAR also requires an
              accessibility statement. The Government Digital Service samples
              public sector sites annually to check.
            </p>

            <h2>Elsewhere, briefly</h2>
            <p>
              <strong>Canada</strong> has two layers. Federally, the Accessible
              Canada Act 2019 targets a barrier-free Canada by 2040 and applies
              to federally regulated sectors such as banking, telecommunications
              and transport; Accessibility Standards Canada has adopted EN 301
              549 as a national standard (CAN/ASC-EN 301 549:2024), which
              aligns Canadian technical requirements with the European ones.
              Provincially, Ontario&apos;s AODA is the long-standing example:
              designated public sector organisations and businesses or non-profits
              with 50 or more employees must meet <strong>WCAG 2.0 Level AA</strong>{" "}
              on public web content posted after 1 January 2012, a requirement in
              force since 1 January 2021.
            </p>
            <p>
              <strong>Australia&apos;s</strong> Disability Discrimination Act
              1992 works like the UK&apos;s Equality Act — a general prohibition
              on discrimination in the provision of goods and services, rather
              than a web-specific rule. The Australian Human Rights Commission
              publishes advisory notes on web access that point at WCAG. They do
              not have direct legal force, but the Commission can take them into
              account when handling complaints.
            </p>
            <p>
              The pattern across all of these is the useful takeaway:{" "}
              <strong>jurisdictions converge on WCAG</strong>. They disagree
              about which version, who is covered and when it bites, but almost
              nobody invents their own criteria. Building to WCAG Level AA — the
              most recent version you can manage — is the portable strategy, and
              it puts you at or above the bar nearly everywhere.
            </p>

            <h2>What complying actually involves</h2>
            <p>
              Whichever regime applies, the work has the same shape.
            </p>
            <p>
              <strong>Conformance across your content, not on average.</strong>{" "}
              WCAG conformance is claimed for whole pages, and a page either meets
              every applicable criterion at the target level or it does not. A
              site that is excellent in most places and unusable at checkout has a
              real problem, and a percentage score will hide it.
            </p>
            <p>
              <strong>Both kinds of testing, because neither is sufficient.</strong>{" "}
              This is the honest part, and it is the same in every guide we
              publish. Automated testing is fast, repeatable and cheap, and it
              reliably catches a meaningful class of failures — missing
              alternative text, insufficient contrast, unnamed controls, broken
              heading structure. It also only ever covers <em>a subset</em> of
              WCAG. No automated tool can judge whether alternative text conveys
              the right meaning, whether a page makes sense read aloud in order,
              whether an error message helps someone recover, or whether a custom
              component behaves sanely with a screen reader. Those need a person,
              and testing with assistive technology and with disabled users is
              where the remaining issues live.{" "}
              <strong>
                No tool — Mend included — makes a site compliant, and no tool can
                certify that it is.
              </strong>
            </p>
            <p>
              <strong>Statements and feedback channels where required.</strong>{" "}
              Under the EU directive and the UK regulations, the accessibility
              statement and a route for users to report barriers are obligations
              in their own right, not niceties. They are also the parts most often
              missing.
            </p>
            <p>
              <strong>Documentation for buyers.</strong> If you sell to
              government or into enterprise procurement, expect to evidence
              conformance in a structured format — see the{" "}
              <Link to="/docs/vpats-and-acrs">VPATs and ACRs guide</Link> for what
              that document is and how to produce a credible one.
            </p>

            <h2>How Mend fits</h2>
            <p>
              Mend is an automated auditor, which means it does the first part of
              the work above and none of the second.
            </p>
            <ul>
              <li>
                The extension audits the page you are on against WCAG 2.0, 2.1
                and 2.2, entirely on your device, and maps each finding to the
                success criteria it relates to — which is what turns a defect
                into evidence about a specific criterion.
              </li>
              <li>
                With an optional account, audits are stored so you can see
                whether a page is improving over time, which is the kind of
                record that is useful when someone asks what you have been doing
                about accessibility.
              </li>
              <li>
                That stored data can be assembled into a{" "}
                <Link to="/vpat">VPAT-format report</Link> covering WCAG 2.2
                Level A and AA, generated on demand.
              </li>
            </ul>
            <div className="callout reveal">
              <p>
                Restating the caveat because it matters most exactly here: that
                report is an <strong>automated assessment</strong>, and it says
                so on its face. A clean Mend audit means the automated checks
                found no failures — not that a criterion is met, not that your
                site conforms, and not that you have discharged a legal
                obligation. Treat it as the fast, repeatable layer underneath
                human evaluation, never as a substitute for it.
              </p>
            </div>

            <h2>Common questions</h2>
          </div>

          <div className="faq reveal-group">
            <details className="reveal">
              <summary>
                Does the ADA apply to my website?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  If you are a state or local government body, yes, and there is
                  now a rule naming WCAG 2.1 Level AA with dates in 2027 and
                  2028. If you are a business open to the public, the Department
                  of Justice&apos;s position is that the ADA covers the services
                  you offer on the web — but no regulation sets out the technical
                  standard you must meet, and courts have not applied this
                  uniformly. That is a genuinely unsettled area of law, and a
                  guide cannot tell you where you stand in it. A lawyer who knows
                  your sector can.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                Which WCAG version and level should I target?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  If a specific regime applies to you, target what it names. If
                  you are choosing for yourself, target{" "}
                  <strong>WCAG 2.2 Level AA</strong>. It is the current version,
                  it is backwards compatible — meeting 2.2 means meeting 2.1 and
                  2.0 — and it is the direction every standard on this page is
                  moving in, including EN 301 549. Level AAA is not intended as a
                  site-wide target; even the W3C does not recommend it as a
                  general policy.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                Is an overlay widget enough?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  No. An overlay is a script that adjusts a page from the outside
                  at runtime; the accessibility problems on this page&apos;s list
                  live in markup, structure, naming and behaviour, and those are
                  fixed at the source. Overlays also cannot supply the thing a
                  regulator or a buyer asks for, which is evidence that your
                  content conforms. Many disabled users report that overlays
                  interfere with the assistive technology they already use and
                  have configured. Some overlay products are marketed with
                  compliance guarantees; no product can make that promise, for the
                  same reason no scanner can — conformance is a property of your
                  content, assessed by people.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                What is the difference between the EAA and EN 301 549?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  The EAA is the law: a directive that says certain products and
                  services sold in the EU must be accessible, transposed into each
                  member state&apos;s national legislation. EN 301 549 is the
                  technical standard describing what that means in practice. Meet
                  the harmonised standard and you get a presumption of conformity
                  with the law&apos;s requirements — you are not required to use
                  it, but you would then need to demonstrate conformity some other
                  way. Law and yardstick, in other words, much like the ADA rule
                  and WCAG.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                Do small businesses have obligations?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  Often, yes — with some carve-outs. General non-discrimination
                  duties like the ADA&apos;s Title III and the UK Equality Act
                  are not scoped by company size. The EAA does exempt
                  microenterprises with fewer than ten employees that provide
                  services, and some regimes use employee thresholds — Ontario&apos;s
                  AODA web requirement starts at 50 employees. So &ldquo;we are
                  small&rdquo; is sometimes a real exemption and often not one.
                  Check the specific regime that applies to you rather than
                  assuming either way.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                We got a demand letter. What now?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  Talk to a lawyer before you respond, and before you make public
                  statements about your accessibility status. That is genuinely
                  the whole answer we can give — this page is educational
                  material, and a specific claim against you is exactly the
                  situation where general information stops being useful.
                </p>
              </div>
            </details>
          </div>

          <div className="prose" style={{ marginTop: "2rem" }}>
            <h2>Sources, and a closing reminder</h2>
            <p>
              Everything above was checked against primary sources on the review
              date at the top of this page. Because this material dates quickly,
              here is where to verify it yourself rather than trusting our
              summary:{" "}
              <a href="https://www.ada.gov/">ada.gov</a> for the ADA and the
              Title II rule,{" "}
              <a href="https://www.section508.gov/">section508.gov</a> and the{" "}
              <a href="https://www.access-board.gov/ict/">
                US Access Board
              </a>{" "}
              for Section 508, the{" "}
              <a href="https://eur-lex.europa.eu/eli/dir/2019/882/oj">
                European Accessibility Act on EUR-Lex
              </a>{" "}
              and the Commission&apos;s{" "}
              <a href="https://digital-strategy.ec.europa.eu/en/policies/web-accessibility">
                web accessibility pages
              </a>{" "}
              for the EU, and{" "}
              <a href="https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps">
                gov.uk
              </a>{" "}
              for the UK regulations.
            </p>
            <p>
              And once more, because it is the most important sentence here:{" "}
              <strong>
                this guide is general educational information, not legal advice.
              </strong>{" "}
              Deadlines and referenced standards change — two of the facts on
              this page changed in the year before it was written. For what your
              organisation specifically must do, ask a lawyer.
            </p>
          </div>
        </div>
      </DocsArticle>
    </MarketingShell>
  );
}
