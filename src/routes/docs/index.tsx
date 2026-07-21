import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingShell } from "@/components/MarketingShell";
import { getSessionUser } from "@/lib/session-fns";

export const Route = createFileRoute("/docs/")({
  loader: () => getSessionUser(),
  head: () => ({
    meta: [
      { title: "Docs — Mend" },
      {
        name: "description",
        content:
          "Plain-language guides to accessibility conformance and the law — what VPATs and ACRs are, and which accessibility rules apply to you.",
      },
    ],
  }),
  component: DocsIndexPage,
});

// The guide list is curated by hand, not generated. When a guide lands, flip its
// entry to a <Link> and update public/llms.txt in the same change — plans 049
// and 050 both say so. Entries whose route does not exist yet render unlinked
// rather than as a dead link.
//
// `href` is typed as a union of the routes that exist plus null, rather than
// inferred via `as const`: once every entry has a real href, inference narrows
// the unlinked branch to `never` and the fallback stops compiling. Add a new
// guide's path to the union when its route lands.
type Guide = {
  title: string;
  summary: string;
  href: "/docs/vpats-and-acrs" | "/docs/accessibility-laws" | null;
};

const guides: Guide[] = [
  {
    title: "VPATs and ACRs",
    summary:
      "What a VPAT document and an Accessibility Conformance Report actually are, who asks you for one, how to read one you have been sent, and what producing one honestly involves.",
    href: "/docs/vpats-and-acrs",
  },
  {
    title: "Accessibility laws and legal compliance",
    summary:
      "A plain-language tour of the rules that reference web accessibility — the ADA, Section 508, the European Accessibility Act, EN 301 549, and the UK's Equality Act — and how they relate to WCAG. Not legal advice.",
    href: "/docs/accessibility-laws",
  },
];

function DocsIndexPage() {
  const user = Route.useLoaderData();
  return (
    <MarketingShell
      current="docs"
      account={user ? { name: user.name, email: user.email } : undefined}
    >
      <div className="wrap page-head">
        <p className="eyebrow enter enter--1">Guides</p>
        <h1 className="enter enter--2">Docs</h1>
        <p className="lede enter enter--3">
          Plain-language accessibility documentation, written to be useful rather
          than alarming. No scare tactics, no compliance theatre — just what the
          terms mean and what is actually being asked of you.
        </p>
      </div>

      <section className="wrap section--tight" aria-labelledby="guides-h">
        <h2 id="guides-h" style={{ marginBottom: "1.2rem" }}>
          Available guides
        </h2>
        <div className="feature-grid reveal-group">
          {guides.map((guide) => (
            <article className="feature reveal" key={guide.title}>
              <h3>
                {guide.href ? (
                  <Link to={guide.href}>{guide.title}</Link>
                ) : (
                  guide.title
                )}
              </h3>
              <p>{guide.summary}</p>
              {guide.href ? null : (
                <p className="feature__extra" style={{ margin: "1rem 0 0" }}>
                  <span className="chip">Coming soon</span>
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="wrap section--tight" aria-labelledby="honesty-h">
        <h2 id="honesty-h">What these guides will not tell you</h2>
        <p>
          No automated tool — Mend included — can make a site accessible or
          certify it as compliant. Automated checks catch a meaningful slice of
          issues quickly and repeatably; the rest needs a person. Anywhere these
          guides describe conformance, they say plainly which part a scanner can
          answer and which part it cannot.
        </p>
      </section>
    </MarketingShell>
  );
}
