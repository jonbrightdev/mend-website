// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// No vitest globals in this repo, so RTL's automatic afterEach cleanup doesn't
// register itself — unmount between tests by hand.
afterEach(cleanup);
import { DashboardClient } from "./DashboardClient";
import type { AuditRecord } from "@/lib/dashboard-data";

// Mock Link so no router context is needed — keep every other export real.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // biome-ignore lint/suspicious/noExplicitAny: minimal Link stand-in for tests.
  Link: ({ to, params, hash, children, ...rest }: any) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {children}
    </a>
  ),
}));

// The composition under test lives in DashboardClient; the pure helpers it uses
// (byRule, countsByImpact, …) are unit-tested in dashboard-data.test.ts, so these
// tests exercise how the filters combine, not the maths.

function node(target: string) {
  return { target, html: "<x>", failureSummary: "fails" };
}

const pricing: AuditRecord = {
  id: "a-pricing",
  url: "https://example.com/pricing",
  pageTitle: "Pricing Page",
  scannedAt: "2026-07-10T12:00:00.000Z",
  history: [5, 3],
  violations: [
    {
      id: "image-alt",
      impact: "critical",
      help: "Images must have alternative text",
      helpUrl: "",
      description: "",
      tags: [],
      nodes: [node("img.hero")],
    },
    {
      id: "color-contrast",
      impact: "serious",
      help: "Elements must meet minimum color contrast ratio thresholds",
      helpUrl: "",
      description: "",
      tags: [],
      nodes: [node("a.cta")],
    },
  ],
};

const about: AuditRecord = {
  id: "a-about",
  url: "https://example.com/about",
  pageTitle: "About Us",
  scannedAt: "2026-07-11T12:00:00.000Z",
  history: [2, 4],
  violations: [
    {
      id: "heading-order",
      impact: "moderate",
      help: "Heading levels should only increase by one",
      helpUrl: "",
      description: "",
      tags: [],
      nodes: [node("h4")],
    },
  ],
};

const runDates = ["2026-07-10", "2026-07-11"];

function renderDashboard(audits: AuditRecord[]) {
  return render(<DashboardClient audits={audits} runDates={runDates} />);
}

describe("DashboardClient", () => {
  it("shows the empty state when there are no audits", () => {
    renderDashboard([]);
    expect(screen.getByRole("heading", { name: /no audits yet/i })).toBeInTheDocument();
  });

  it("narrows the pages table as you filter by URL", async () => {
    const user = userEvent.setup();
    renderDashboard([pricing, about]);

    // Both pages present up front (page-title links live in the pages table).
    expect(screen.getByRole("link", { name: "Pricing Page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About Us" })).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "pricing");

    expect(screen.getByRole("link", { name: "Pricing Page" })).toBeInTheDocument();
    expect(screen.queryByText("About Us")).not.toBeInTheDocument();
  });

  it("filters the rule list to the chosen impact and announces it", async () => {
    const user = userEvent.setup();
    renderDashboard([pricing, about]);

    // All three rules listed before filtering.
    expect(screen.getByRole("link", { name: "image-alt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "color-contrast" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "heading-order" })).toBeInTheDocument();

    const criticalChip = screen.getByRole("button", { name: /critical/i });
    await user.click(criticalChip);

    expect(criticalChip).toHaveAttribute("aria-pressed", "true");
    // Only the critical rule survives in "Top issues by rule".
    expect(screen.getByRole("link", { name: "image-alt" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "color-contrast" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "heading-order" })).not.toBeInTheDocument();
    // The live region reflects the active impact.
    expect(screen.getByRole("status")).toHaveTextContent(/critical/i);
  });

  it("scopes the stats to one page and clears again", async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard([pricing, about]);

    // "Total violations" also labels a trend-table column, so read the stat's
    // value node directly rather than by text.
    const total = () => container.querySelector(".stat--total .stat__v");

    // Whole site: pricing has 2 nodes, about has 1 → 3 total. The scope banner
    // (and its "Show all pages" reset) is absent.
    expect(total()).toHaveTextContent("3");
    expect(screen.queryByRole("button", { name: /show all pages/i })).not.toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: /scope/i }),
      "https://example.com/pricing",
    );

    // Scope banner appears (naming the page) and the total drops to that page's
    // node count.
    expect(screen.getByRole("button", { name: /show all pages/i })).toBeInTheDocument();
    expect(container.querySelector(".scope-bar code")).toHaveTextContent("example.com/pricing");
    expect(total()).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: /show all pages/i }));
    expect(screen.queryByRole("button", { name: /show all pages/i })).not.toBeInTheDocument();
    expect(total()).toHaveTextContent("3");
  });

  it("composes search and impact filters on the pages table", async () => {
    const user = userEvent.setup();
    renderDashboard([pricing, about]);

    // "about" matches only the About page; "critical" excludes it (About has
    // none), so the two filters together leave the table empty.
    await user.type(screen.getByRole("searchbox"), "about");
    await user.click(screen.getByRole("button", { name: /critical/i }));

    expect(screen.getByText(/no pages match this filter/i)).toBeInTheDocument();
  });
});
