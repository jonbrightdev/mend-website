import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { DocsArticle } from "@/components/DocsArticle";
import { getSessionUser } from "@/lib/session-fns";

export const Route = createFileRoute("/docs/vpats-and-acrs")({
  loader: () => getSessionUser(),
  head: () => ({
    meta: [
      { title: "VPATs and ACRs, explained — Mend" },
      {
        name: "description",
        content:
          "What a VPAT and an Accessibility Conformance Report are, who asks for one, how to read one critically, and what producing a credible one involves.",
      },
    ],
  }),
  component: VpatsAndAcrsPage,
});

// Facts in this guide were verified on 20 July 2026 against ITI
// (itic.org/policy/accessibility/vpat) and Section508.gov — current template
// version, the four editions, and the conformance vocabulary all come from
// those primary sources rather than from secondary write-ups. Re-verify and
// bump the lastReviewed prop whenever ITI ships a new template release.
function VpatsAndAcrsPage() {
  const user = Route.useLoaderData();
  return (
    <MarketingShell
      current="docs"
      account={user ? { name: user.name, email: user.email } : undefined}
    >
      <DocsArticle
        eyebrow="Guide"
        title="VPATs and ACRs"
        lede="A VPAT is the blank template. An ACR is the finished report. Here is what they contain, who asks for one, and how to tell a careful report from a careless one."
        lastReviewed="20 July 2026"
      >
        <div className="wrap section--tight">
          <div className="prose">
            <h2>The 30-second version</h2>
            <p>
              A <strong>VPAT</strong> — Voluntary Product Accessibility Template
              — is a blank form published by the Information Technology Industry
              Council (ITI). An <strong>ACR</strong> — Accessibility Conformance
              Report — is what you get once a vendor fills that form in for a
              specific product at a specific version.
            </p>
            <p>
              Template, then completed document. In conversation people say
              &ldquo;send us your VPAT&rdquo; when they mean the ACR, and that
              is harmless. The distinction starts to matter when you are the one
              answering: what a buyer wants is not the empty template, it is
              your evaluated, dated, product-specific report.
            </p>
            <div className="callout reveal">
              <p>
                You may also see the ACR called a &ldquo;VPAT 2.5&rdquo;, a
                &ldquo;completed VPAT&rdquo;, or just &ldquo;the accessibility
                documentation&rdquo;. These all describe the same deliverable.
              </p>
            </div>

            <h2>What is in one</h2>
            <p>
              ITI publishes the template in four editions, so you fill in the
              one matching the standard your buyer cares about. The current
              release is <strong>VPAT 2.5Rev</strong>, published in April 2025.
            </p>
            <ul>
              <li>
                <strong>508 edition</strong> — the Revised Section 508 Standards,
                the US federal accessibility requirement.
              </li>
              <li>
                <strong>EU edition</strong> — EN 301 549, the European standard
                used in public procurement.
              </li>
              <li>
                <strong>WCAG edition</strong> — the W3C&apos;s Web Content
                Accessibility Guidelines alone. The current edition covers WCAG
                2.2.
              </li>
              <li>
                <strong>INT (international) edition</strong> — all three of the
                above in one document. This is the one to reach for if you sell
                into more than one market and would rather maintain a single
                report.
              </li>
            </ul>
            <p>
              Inside, the body of the report is a set of tables — one row per
              success criterion. Each row carries the criterion, a conformance
              level, and a remarks column. The conformance level is chosen from
              a fixed vocabulary:
            </p>
            <ul>
              <li>
                <strong>Supports</strong> — the product has at least one method
                that meets the criterion without known defects, or meets it with
                equivalent facilitation.
              </li>
              <li>
                <strong>Partially Supports</strong> — some functionality of the
                product does not meet the criterion.
              </li>
              <li>
                <strong>Does Not Support</strong> — the majority of product
                functionality does not meet the criterion.
              </li>
              <li>
                <strong>Not Applicable</strong> — the criterion is not relevant
                to the product.
              </li>
              <li>
                <strong>Not Evaluated</strong> — permitted only in the Level AAA
                table, which is the one table not required to be completed. It
                is not an escape hatch for Level A or AA rows you would rather
                not answer.
              </li>
            </ul>
            <p>
              The remarks column is where the honesty lives. Remarks are required
              whenever a row says <em>Partially Supports</em> or{" "}
              <em>Does Not Support</em>, and encouraged even when a row says{" "}
              <em>Supports</em>. A report is only as useful as that column: the
              level tells a buyer there is a problem, the remark tells them what
              it is and whether it affects them.
            </p>
            <p>
              A report also carries an evaluation-methods section describing how
              the product was tested — manual, automated, or both — and which
              tools were used. Read on for why that section deserves more
              attention than it usually gets.
            </p>

            <h2>Who asks, and why</h2>
            <p>
              <strong>US federal procurement.</strong> This is the original
              driver. Agencies buying information and communication technology
              need to document conformance with the Revised Section 508
              Standards, so vendors selling to them are routinely asked for an
              ACR. Using the VPAT template is not itself mandatory — but
              producing the report, in some form, is how the sale proceeds.
            </p>
            <p>
              <strong>State, local, and education buyers.</strong> Many have
              adopted procurement policies modelled on Section 508, and
              universities in particular have become consistent about asking.
              Requirements here vary far more than at federal level.
            </p>
            <p>
              <strong>Enterprise vendor-risk review.</strong> Large private
              buyers increasingly fold accessibility documentation into the same
              questionnaire that asks about security and data handling.
            </p>
            <p>
              <strong>The European market.</strong> The European Accessibility
              Act applies to a broad range of products and services sold in the
              EU, which has made conformance documentation an ordinary part of
              doing business there rather than a public-sector speciality.
            </p>
            <p className="muted">
              For what these regimes actually require — and which of them applies
              to you — see{" "}
              <Link to="/docs/accessibility-laws">
                accessibility laws and legal compliance
              </Link>
              .
            </p>

            <h2>How to read one critically</h2>
            <p>
              If you have been sent an ACR and need to judge it, the useful
              signals are rarely in the summary.
            </p>
            <ul>
              <li>
                <strong>An unbroken wall of &ldquo;Supports&rdquo; with an empty
                remarks column is a smell</strong>, not a triumph. Real products
                have rough edges. A report claiming none usually means nobody
                looked hard.
              </li>
              <li>
                <strong>Read the evaluation-methods section first.</strong> Who
                tested this, using what, and how? &ldquo;Automated scan&rdquo;
                with no manual or assistive-technology testing tells you the
                report covers only what a scanner can see.
              </li>
              <li>
                <strong>Check the date and the product version.</strong> An ACR
                describes one version at one moment. A report two years and six
                releases old describes software your users are not running.
              </li>
              <li>
                <strong>Specific, dated remarks beat unqualified
                perfection.</strong> A vendor writing &ldquo;Partially Supports —
                the date picker in the booking flow is not reachable by keyboard;
                fix scheduled for Q3&rdquo; is telling you they tested properly
                and know their product. That is a better partner than one
                claiming flawlessness.
              </li>
              <li>
                <strong>Check it covers what you will actually use.</strong>{" "}
                Reports are scoped to a product, and the scope statement may
                exclude the admin console, the mobile app, or the very module you
                are buying.
              </li>
            </ul>

            <h2>How to produce a credible one</h2>
            <p>
              If you are on the answering side, the shape of the work is
              consistent.
            </p>
            <ul>
              <li>
                <strong>Start from the real template.</strong> Download the
                current edition from ITI rather than working from a competitor&apos;s
                PDF or a blog&apos;s reconstruction.
              </li>
              <li>
                <strong>Test before you fill anything in.</strong> Automated
                checks first, because they are fast and repeatable and will find
                the mechanical failures. Then manual testing: keyboard-only
                operation, screen-reader passes, zoom and reflow, and human
                judgement about whether alternative text and error messages
                actually communicate anything.
              </li>
              <li>
                <strong>Be specific in remarks.</strong> Name the component, the
                condition, and where it appears. Vague remarks read as evasion
                even when they are not.
              </li>
              <li>
                <strong>Version it and re-issue it.</strong> An ACR describes a
                point in time; when the product changes materially, the report
                needs revisiting.
              </li>
              <li>
                <strong>Do not outsource the claim to a tool.</strong> This is
                the important one. Automated testing verifies only a subset of
                each success criterion — it reliably catches missing alternative
                text, insufficient contrast, and unnamed controls, and it cannot
                assess meaning, context, or what using the product with assistive
                technology is actually like. A row marked{" "}
                <em>Supports</em> on the strength of a clean scan alone is a
                claim nobody has checked. Signing a conformance report is a human
                act, and it needs human evaluation behind it.
              </li>
            </ul>

            <h2>How Mend helps</h2>
            <p>
              Mend&apos;s audits map every finding to the WCAG success criteria it
              relates to, which is the raw material the conformance table is
              built from — it turns &ldquo;this image has no alternative
              text&rdquo; into &ldquo;this is evidence about criterion
              1.1.1&rdquo;.
            </p>
            <p>
              If you have an account, Mend can also assemble that data into a{" "}
              <Link to="/vpat">VPAT-format report</Link> covering WCAG 2.2 Level
              A and AA, generated on demand from your stored audits.
            </p>
            <div className="callout reveal">
              <p>
                That report is an <strong>automated assessment</strong>, and it
                says so on its face. It is a starting point for the work
                described above — a human completes it — not a finished
                conformance claim. Where it marks a criterion{" "}
                <em>Supports</em>, that means the automated checks found no
                failures, which is not the same as the criterion being met.
              </p>
            </div>

            <h2>Common questions</h2>
          </div>

          <div className="faq reveal-group">
            <details className="reveal">
              <summary>
                Is a VPAT legally required?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  No law requires you to publish a VPAT. The pressure is
                  commercial: US federal agencies need conformance documentation
                  for the technology they buy, so vendors who want those sales
                  produce an ACR. Using ITI&apos;s template specifically is a
                  convention, not a mandate — it is simply the form everyone
                  recognises. Separately, accessibility law may well apply to
                  your product regardless of whether anyone asks for paperwork.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                How often should it be updated?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  Whenever the product changes in a way that would change an
                  answer — a version release, a redesign, a fix to something the
                  report flagged. Guidance from Section508.gov is that an updated
                  report may be required every time the product is changed or
                  updated. In practice, teams re-issue on a regular cadence and
                  after any significant release, and always date the document.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                Can an automated tool generate my ACR?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  Partly — and the part it cannot do is the part that matters
                  most. A scanner can populate the criteria it is able to test
                  and give you evidence for the remarks column, which is real
                  work saved. It cannot judge whether alternative text is
                  meaningful, whether a page is navigable by screen reader, or
                  whether an error message helps. A report generated by a tool
                  and shipped unreviewed is a claim about your product that no
                  person has verified.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                How is this different from an accessibility statement?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  An accessibility statement is a public, plain-language page on
                  your website describing your commitment, known limitations, and
                  how to contact you about a barrier. An ACR is a structured,
                  criterion-by-criterion technical document, usually sent to a
                  specific buyer on request. Different audiences, different
                  purposes; many organisations maintain both.
                </p>
              </div>
            </details>
            <details className="reveal">
              <summary>
                What does it cost to have one produced?{" "}
                <span className="q-icon" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="faq__body">
                <p>
                  It varies enormously with product size and how much
                  accessibility work has already been done, and quoted figures
                  age badly, so we will not invent a number. The honest framing:
                  most of the cost is the <em>evaluation</em>, not the
                  paperwork. If your product has never been tested against WCAG,
                  the report is the small part and the testing — plus fixing what
                  it finds — is the large part. Vendors who test continuously
                  find re-issuing a report comparatively cheap.
                </p>
              </div>
            </details>
          </div>

          <div className="prose" style={{ marginTop: "2rem" }}>
            <h2>A note on the name</h2>
            <p>
              VPAT&reg; is a registered service mark of the Information
              Technology Industry Council. ITI publishes the template and its
              instructions, and its page at{" "}
              <a href="https://www.itic.org/policy/accessibility/vpat">
                itic.org/policy/accessibility/vpat
              </a>{" "}
              is the authoritative source for the current version and editions —
              this guide summarises it, and where the two disagree, ITI is right.
              For the procurement side, Section508.gov&apos;s guidance on
              creating and reading an ACR is the equivalent primary reference.
            </p>
          </div>
        </div>
      </DocsArticle>
    </MarketingShell>
  );
}
