// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// No vitest globals in this repo, so RTL's automatic afterEach cleanup doesn't
// register itself — unmount between tests by hand.
afterEach(cleanup);
import { DocsArticle } from "./DocsArticle";

// Mock Link so no router context is needed — keep every other export real.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // biome-ignore lint/suspicious/noExplicitAny: minimal Link stand-in for tests.
  Link: ({ to, children, ...rest }: any) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

function renderArticle() {
  return render(
    <DocsArticle
      eyebrow="Guide"
      title="VPATs and ACRs"
      lede="What these documents are and who asks for them."
      lastReviewed="20 July 2026"
    >
      <section className="wrap section--tight">
        <h2>Body heading</h2>
      </section>
    </DocsArticle>,
  );
}

describe("DocsArticle", () => {
  it("renders the title as the page's h1 and keeps body headings below it", () => {
    renderArticle();
    expect(
      screen.getByRole("heading", { level: 1, name: "VPATs and ACRs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Body heading" }),
    ).toBeInTheDocument();
  });

  it("shows the eyebrow, lede and last-reviewed date", () => {
    renderArticle();
    expect(screen.getByText("Guide")).toBeInTheDocument();
    expect(
      screen.getByText("What these documents are and who asks for them."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Last reviewed: 20 July 2026/)).toBeInTheDocument();
  });

  it("links back to the docs index", () => {
    renderArticle();
    expect(screen.getByRole("link", { name: "← All guides" })).toHaveAttribute(
      "href",
      "/docs",
    );
  });
});
