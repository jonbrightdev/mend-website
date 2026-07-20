// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// No vitest globals in this repo, so RTL's automatic afterEach cleanup doesn't
// register itself — unmount between tests by hand.
afterEach(cleanup);
import { VpatClient } from "./VpatClient";
import { WCAG_22_CRITERIA } from "@/lib/wcag-criteria";
import type { VpatReportData } from "@/lib/vpat-data";

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

function report(overrides: Partial<VpatReportData> = {}): VpatReportData {
  return {
    productName: "acme.test",
    contactEmail: "owner@acme.test",
    generatedAt: "2026-07-20T09:00:00.000Z",
    pages: [
      { url: "https://acme.test/", pageTitle: "Home", scannedAt: "2026-07-19T08:00:00.000Z" },
    ],
    rows: WCAG_22_CRITERIA.map((criterion) => ({
      criterion,
      conformance: "Supports" as const,
      findings: [],
    })),
    unmapped: [],
    ...overrides,
  };
}

function withFinding(sc: string, conformance: "Partially Supports" | "Does Not Support") {
  const base = report();
  return report({
    rows: base.rows.map((r) =>
      r.criterion.sc === sc
        ? {
            ...r,
            conformance,
            findings: [
              {
                ruleId: "color-contrast",
                help: "Elements must meet contrast thresholds",
                impact: "serious" as const,
                pageCount: 1,
                nodeCount: 4,
              },
            ],
          }
        : r,
    ),
  });
}

describe("VpatClient", () => {
  it("explains the prerequisite when there is no report to build", () => {
    render(<VpatClient report={null} />);

    expect(screen.getByText(/at least one scanned page/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /monitors/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download report/i })).not.toBeInTheDocument();
  });

  it("renders every criterion across the two level tables", () => {
    render(<VpatClient report={report()} />);

    expect(screen.getByRole("rowheader", { name: "1.1.1 Non-text Content" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "1.4.3 Contrast (Minimum)" })).toBeInTheDocument();
    // 4.1.1 Parsing has no row — WCAG 2.2 removed it.
    expect(screen.queryByRole("rowheader", { name: /^4\.1\.1/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("rowheader")).toHaveLength(WCAG_22_CRITERIA.length);
  });

  it("shows the determination and the findings behind it", () => {
    render(<VpatClient report={withFinding("1.4.3", "Partially Supports")} />);

    expect(screen.getByText("Partially Supports")).toBeInTheDocument();
    expect(
      screen.getByText(/Elements must meet contrast thresholds \(4 instances across 1 page\)/),
    ).toBeInTheDocument();
  });

  it("leads with what an automated assessment can and cannot establish", () => {
    render(<VpatClient report={report()} />);

    expect(screen.getByText(/automated assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/needs manual evaluation by a qualified assessor/i)).toBeInTheDocument();
  });

  it("defaults the name to the server's and encodes it into the download link", async () => {
    const user = userEvent.setup();
    render(<VpatClient report={report()} />);

    const link = () => screen.getByRole("link", { name: /download report/i });
    expect(link()).toHaveAttribute("href", "/api/vpat?name=acme.test");

    const input = screen.getByLabelText(/product or site name/i);
    await user.clear(input);
    await user.type(input, "Acme Store & Co");

    expect(link()).toHaveAttribute("href", "/api/vpat?name=Acme%20Store%20%26%20Co");
  });

  it("drops the query entirely when the name is blanked", async () => {
    const user = userEvent.setup();
    render(<VpatClient report={report()} />);

    await user.clear(screen.getByLabelText(/product or site name/i));

    expect(screen.getByRole("link", { name: /download report/i })).toHaveAttribute(
      "href",
      "/api/vpat",
    );
  });

  it("lists unmapped findings only when there are some", () => {
    const { unmount } = render(<VpatClient report={report()} />);
    expect(screen.queryByText("Other findings")).not.toBeInTheDocument();
    unmount();

    render(
      <VpatClient
        report={report({
          unmapped: [
            {
              ruleId: "heading-order",
              help: "Heading levels should only increase by one",
              impact: "moderate",
              pageCount: 1,
              nodeCount: 2,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Other findings")).toBeInTheDocument();
    expect(screen.getByText("heading-order")).toBeInTheDocument();
  });
});
