import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

// Shared layout for a docs guide: the `page-head` intro every prose page uses,
// a "Last reviewed" line, the article body, and a back link. It deliberately
// does NOT render MarketingShell — the route owns the shell so the loader and
// account wiring stay in routes, matching privacy.tsx / support.tsx.
export function DocsArticle({
  eyebrow,
  title,
  lede,
  lastReviewed,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  lastReviewed: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="wrap page-head">
        <p className="eyebrow enter enter--1">{eyebrow}</p>
        <h1 className="enter enter--2">{title}</h1>
        <p className="lede enter enter--3">{lede}</p>
        <p
          className="muted enter enter--4"
          style={{ marginTop: "1rem", fontSize: ".9rem" }}
        >
          Last reviewed: {lastReviewed}
        </p>
      </div>

      {children}

      <section className="wrap section--tight">
        <p style={{ margin: 0 }}>
          <Link to="/docs">← All guides</Link>
        </p>
      </section>
    </>
  );
}
