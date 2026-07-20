// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// No vitest globals in this repo, so RTL's automatic afterEach cleanup doesn't
// register itself — unmount between tests by hand.
afterEach(cleanup);

// The server fns are the boundary under test: these cases assert what the UI
// sends and how it renders what comes back, not what the database does.
vi.mock("@/lib/monitor-fns", () => ({
  createMonitor: vi.fn(),
  toggleMonitor: vi.fn(),
  removeMonitor: vi.fn(),
}));

import { MonitorsClient } from "./MonitorsClient";
import { createMonitor, removeMonitor, toggleMonitor } from "@/lib/monitor-fns";
import type { MonitorRow } from "@/lib/monitor-queries";

const HOUR = 60 * 60 * 1000;

function monitorRow(over: Partial<MonitorRow> = {}): MonitorRow {
  return {
    id: "m1",
    url: "https://example.com/pricing",
    createdAt: "2026-07-19T10:00:00.000Z",
    pausedAt: null,
    nextRunAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    lastRunAt: null,
    lastError: null,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(createMonitor).mockReset();
  vi.mocked(toggleMonitor).mockReset();
  vi.mocked(removeMonitor).mockReset();
});

function renderMonitors(monitors: MonitorRow[], maxMonitors = 10) {
  return render(
    <MonitorsClient initialMonitors={monitors} maxMonitors={maxMonitors} />,
  );
}

describe("MonitorsClient", () => {
  it("explains the feature when nothing is monitored yet", () => {
    renderMonitors([]);
    expect(screen.getByText(/audit it once a day/i)).toBeInTheDocument();
  });

  it("lists a monitored page", () => {
    renderMonitors([monitorRow()]);
    expect(screen.getByText("https://example.com/pricing")).toBeInTheDocument();
    // Nothing has run yet, so the row says so rather than inventing a result.
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
  });

  it("submits the URL and clears the field on success", async () => {
    const user = userEvent.setup();
    const added = monitorRow({ id: "m2", url: "https://example.com/new" });
    vi.mocked(createMonitor).mockResolvedValue({ monitors: [added] });

    renderMonitors([]);
    const input = screen.getByLabelText(/page url/i);
    await user.type(input, "https://example.com/new");
    await user.click(screen.getByRole("button", { name: /track this page/i }));

    expect(createMonitor).toHaveBeenCalledWith({
      data: "https://example.com/new",
    });
    expect(screen.getByText("https://example.com/new")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("surfaces the server's own message when adding fails", async () => {
    const user = userEvent.setup();
    vi.mocked(createMonitor).mockRejectedValue(
      new Error("You're already monitoring this page."),
    );

    renderMonitors([]);
    await user.type(screen.getByLabelText(/page url/i), "https://example.com/dupe");
    await user.click(screen.getByRole("button", { name: /track this page/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /already monitoring this page/i,
    );
  });

  it("offers Resume, and no next-run estimate, on a paused row", () => {
    renderMonitors([monitorRow({ pausedAt: "2026-07-19T12:00:00.000Z" })]);

    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("asks the server to pause an active monitor", async () => {
    const user = userEvent.setup();
    vi.mocked(toggleMonitor).mockResolvedValue({
      monitors: [monitorRow({ pausedAt: "2026-07-20T09:00:00.000Z" })],
    });

    renderMonitors([monitorRow()]);
    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(toggleMonitor).toHaveBeenCalledWith({
      data: { id: "m1", paused: true },
    });
    expect(await screen.findByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  it("shows the last run's error when one is recorded", () => {
    renderMonitors([
      monitorRow({
        lastRunAt: new Date(Date.now() - 2 * HOUR).toISOString(),
        lastError: "Navigation timed out",
      }),
    ]);
    expect(screen.getByText(/navigation timed out/i)).toBeInTheDocument();
  });

  it("requires a second click before removing", async () => {
    const user = userEvent.setup();
    vi.mocked(removeMonitor).mockResolvedValue({ monitors: [] });

    renderMonitors([monitorRow()]);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeMonitor).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirm removing/i }));
    expect(removeMonitor).toHaveBeenCalledWith({ data: "m1" });
  });

  it("disables the add button at the cap", () => {
    renderMonitors([monitorRow()], 1);
    expect(screen.getByRole("button", { name: /track this page/i })).toBeDisabled();
    expect(screen.getByText(/maximum of 1 pages/i)).toBeInTheDocument();
  });
});
