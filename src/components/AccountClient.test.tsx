// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountClient } from "./AccountClient";
import type { ApiKeyRow } from "@/lib/account-fns";

// The component calls server functions (which would `fetch` in jsdom) and the
// auth client — mock both boundaries. The server-side behaviour is covered by
// account-fns.test.ts; here we test the component's wiring around them.
import { createApiKey, revokeApiKey, deleteAllAudits } from "@/lib/account-fns";
import { authClient } from "@/lib/auth-client";

vi.mock("@/lib/account-fns", () => ({
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  deleteAllAudits: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { deleteUser: vi.fn() },
}));

// No vitest globals, so register RTL cleanup ourselves.
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function key(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: "k1",
    name: "Chrome extension",
    createdAt: "2026-07-01T00:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("AccountClient — keys", () => {
  it("reveals a freshly generated key once, then hides it on Done", async () => {
    const user = userEvent.setup();
    vi.mocked(createApiKey).mockResolvedValue({
      key: "mend_secret_abc",
      keys: [key()],
    });
    render(<AccountClient initialKeys={[]} hasPassword={true} />);

    await user.click(screen.getByRole("button", { name: /generate a key/i }));

    const field = screen.getByLabelText(/api key/i);
    expect(field).toHaveValue("mend_secret_abc");

    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it("drops a revoked key from the list", async () => {
    const user = userEvent.setup();
    vi.mocked(revokeApiKey).mockResolvedValue({ keys: [] });
    render(
      <AccountClient
        initialKeys={[key({ id: "k1", name: "Old laptop key" })]}
        hasPassword={true}
      />,
    );

    expect(screen.getByText("Old laptop key")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revoke/i }));

    expect(revokeApiKey).toHaveBeenCalledWith({ data: "k1" });
    expect(screen.queryByText("Old laptop key")).not.toBeInTheDocument();
  });

  it("surfaces an alert when key creation fails", async () => {
    const user = userEvent.setup();
    vi.mocked(createApiKey).mockRejectedValue(new Error("boom"));
    render(<AccountClient initialKeys={[]} hasPassword={true} />);

    await user.click(screen.getByRole("button", { name: /generate a key/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't create a key/i);
  });
});

describe("AccountClient — danger zone", () => {
  it("requires two clicks to delete all audits, and Cancel disarms", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteAllAudits).mockResolvedValue({ ok: true });
    render(<AccountClient initialKeys={[]} hasPassword={true} />);

    // First click only arms — nothing deleted yet.
    await user.click(screen.getByRole("button", { name: /^delete all synced audits$/i }));
    expect(deleteAllAudits).not.toHaveBeenCalled();

    // Cancel disarms without deleting.
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(deleteAllAudits).not.toHaveBeenCalled();

    // Arm again, then confirm.
    await user.click(screen.getByRole("button", { name: /^delete all synced audits$/i }));
    await user.click(screen.getByRole("button", { name: /click again to confirm/i }));

    expect(deleteAllAudits).toHaveBeenCalledOnce();
    expect(await screen.findByText(/all synced audits deleted/i)).toBeInTheDocument();
  });

  it("gates password-account deletion on a typed password", async () => {
    const user = userEvent.setup();
    vi.mocked(authClient.deleteUser).mockResolvedValue({ data: null, error: null });
    render(<AccountClient initialKeys={[]} hasPassword={true} />);

    await user.click(screen.getByRole("button", { name: /^delete account$/i }));

    const confirm = screen.getByRole("button", { name: /permanently delete account/i });
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/confirm your password/i), "hunter2");
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(authClient.deleteUser).toHaveBeenCalledWith({ password: "hunter2" });
  });

  it("deletes an OAuth-only account with no password field", async () => {
    const user = userEvent.setup();
    vi.mocked(authClient.deleteUser).mockResolvedValue({ data: null, error: null });
    render(<AccountClient initialKeys={[]} hasPassword={false} />);

    await user.click(screen.getByRole("button", { name: /^delete account$/i }));

    // OAuth branch renders no password field; deletion confirms directly.
    expect(screen.queryByLabelText(/confirm your password/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /permanently delete account/i }));

    expect(authClient.deleteUser).toHaveBeenCalledWith({});
  });
});
