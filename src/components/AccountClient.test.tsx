// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountClient } from "./AccountClient";
import type { ApiKeyRow, BillingSummary, KeyQuota } from "@/lib/account-fns";

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

function billingProps(overrides: Partial<BillingSummary> = {}): BillingSummary {
  return {
    plan: "free",
    productPlan: "free",
    status: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    interval: null,
    canUpgrade: true,
    canManage: false,
    billingEnabled: true,
    freeLimitsEnforced: false,
    ...overrides,
  };
}

// Every test renders the whole account page, so the two new loader props get a
// default here and each test overrides only what it is about.
function renderAccount(
  props: {
    initialKeys?: ApiKeyRow[];
    hasPassword?: boolean;
    keyQuota?: KeyQuota;
    billing?: Partial<BillingSummary>;
  } = {},
) {
  return render(
    <AccountClient
      initialKeys={props.initialKeys ?? []}
      hasPassword={props.hasPassword ?? true}
      keyQuota={props.keyQuota ?? { active: 0, max: 20 }}
      billing={billingProps(props.billing)}
    />,
  );
}

describe("AccountClient — keys", () => {
  it("reveals a freshly generated key once, then hides it on Done", async () => {
    const user = userEvent.setup();
    vi.mocked(createApiKey).mockResolvedValue({
      key: "mend_secret_abc",
      keys: [key()],
    });
    renderAccount({ hasPassword: true });

    await user.click(screen.getByRole("button", { name: /generate a key/i }));

    const field = screen.getByLabelText(/api key/i);
    expect(field).toHaveValue("mend_secret_abc");

    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
  });

  it("broadcasts the generated key via postMessage to its own origin", async () => {
    const user = userEvent.setup();
    vi.mocked(createApiKey).mockResolvedValue({
      key: "mend_secret_abc",
      keys: [key()],
    });
    // jsdom always reports "" for a same-window MessageEvent's `origin`
    // (verified against jsdom 29 directly), so listening for the "message"
    // event can't check the target origin argument. Spy on postMessage
    // itself instead — that's the call whose arguments the done criteria
    // actually cares about (a literal origin, never "*").
    const postMessage = vi.spyOn(window, "postMessage");

    renderAccount({ hasPassword: true });
    await user.click(screen.getByRole("button", { name: /generate a key/i }));

    expect(postMessage).toHaveBeenCalledWith(
      { source: "mend-website", type: "MEND_API_KEY", apiKey: "mend_secret_abc" },
      window.location.origin,
    );
  });

  it("drops a revoked key from the list", async () => {
    const user = userEvent.setup();
    vi.mocked(revokeApiKey).mockResolvedValue({ keys: [] });
    renderAccount({ initialKeys: [key({ id: "k1", name: "Old laptop key" })] });

    expect(screen.getByText("Old laptop key")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revoke/i }));

    expect(revokeApiKey).toHaveBeenCalledWith({ data: "k1" });
    expect(screen.queryByText("Old laptop key")).not.toBeInTheDocument();
  });

  it("surfaces the server's own message when key creation fails", async () => {
    const user = userEvent.setup();
    // The quota error names the limit and the way out; a generic string here
    // would leave the user with no idea why Generate stopped working.
    vi.mocked(createApiKey).mockRejectedValue(
      new Error("Free accounts can have 3 active keys. Revoke one or upgrade to Pro."),
    );
    renderAccount();

    await user.click(screen.getByRole("button", { name: /generate a key/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /free accounts can have 3 active keys/i,
    );
  });

  it("falls back to generic copy when the failure carries no message", async () => {
    const user = userEvent.setup();
    vi.mocked(createApiKey).mockRejectedValue(new Error(""));
    renderAccount();

    await user.click(screen.getByRole("button", { name: /generate a key/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't create a key/i);
  });

  it("shows the quota and blocks Generate at the cap", async () => {
    renderAccount({
      initialKeys: [key({ id: "a" }), key({ id: "b" }), key({ id: "c" })],
      keyQuota: { active: 3, max: 3 },
      billing: { plan: "free" },
    });

    expect(screen.getByText(/3 of 3 active keys/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate a key/i })).toBeDisabled();
    expect(screen.getByText(/upgrade to pro for more/i)).toBeInTheDocument();
  });

  it("re-enables Generate once a revoke frees a slot", async () => {
    const user = userEvent.setup();
    vi.mocked(revokeApiKey).mockResolvedValue({
      keys: [key({ id: "a" }), key({ id: "b" })],
    });
    renderAccount({
      initialKeys: [key({ id: "a" }), key({ id: "b" }), key({ id: "c" })],
      keyQuota: { active: 3, max: 3 },
    });

    expect(screen.getByRole("button", { name: /generate a key/i })).toBeDisabled();

    // The cap follows the server's returned list, not the stale loader count.
    await user.click(screen.getAllByRole("button", { name: /revoke/i })[0]!);

    expect(screen.getByRole("button", { name: /generate a key/i })).toBeEnabled();
    expect(screen.getByText(/2 of 3 active keys/i)).toBeInTheDocument();
  });
});

describe("AccountClient — billing panel", () => {
  it("shows the Free badge and an upgrade control", () => {
    renderAccount({ billing: { plan: "free", canUpgrade: true } });

    expect(screen.getByTestId("plan-badge")).toHaveTextContent(/free/i);
    expect(screen.getByRole("button", { name: /upgrade to pro/i })).toBeInTheDocument();
  });

  it("shows Pro with its renewal date and no upgrade control", () => {
    renderAccount({
      billing: {
        plan: "pro",
        productPlan: "pro",
        status: "active",
        currentPeriodEnd: "2026-09-01T00:00:00.000Z",
        interval: "month",
        canUpgrade: false,
        canManage: true,
      },
    });

    expect(screen.getByTestId("plan-badge")).toHaveTextContent(/pro/i);
    expect(screen.queryByRole("button", { name: /upgrade to pro/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manage subscription/i })).toBeInTheDocument();
  });

  it("says when Pro is set to lapse rather than renew", () => {
    renderAccount({
      billing: {
        plan: "pro",
        productPlan: "pro",
        status: "active",
        currentPeriodEnd: "2026-09-01T00:00:00.000Z",
        cancelAtPeriodEnd: true,
        interval: "year",
        canUpgrade: false,
        canManage: true,
      },
    });

    expect(screen.getByText(/returns to free/i)).toBeInTheDocument();
  });

  it("warns a past_due subscriber to fix their card", () => {
    renderAccount({
      billing: {
        plan: "pro",
        productPlan: "pro",
        status: "past_due",
        canUpgrade: false,
        canManage: true,
      },
    });

    expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
  });

  it("lists the Free allowances only once limits are enforced", () => {
    renderAccount({ billing: { freeLimitsEnforced: false } });
    expect(screen.queryByText(/30 days of audit history/i)).not.toBeInTheDocument();

    cleanup();
    renderAccount({ billing: { freeLimitsEnforced: true } });
    expect(screen.getByText(/30 days of audit history/i)).toBeInTheDocument();
  });

  it("hides both billing actions when Stripe is not configured", () => {
    renderAccount({
      billing: { billingEnabled: false, canUpgrade: false, canManage: false },
    });

    expect(screen.queryByRole("button", { name: /upgrade to pro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manage subscription/i })).not.toBeInTheDocument();
    expect(screen.getByText(/aren't available right now/i)).toBeInTheDocument();
  });

  it("posts to Checkout with the session cookie and the chosen price", async () => {
    const user = userEvent.setup();
    // The panel navigates on success, which jsdom cannot do — resolve without a
    // url so the assertion is about the request, not the redirect.
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });
    vi.stubGlobal("fetch", fetchMock);

    renderAccount({ billing: { canUpgrade: true } });
    await user.click(screen.getByRole("button", { name: /upgrade to pro/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        method: "POST",
        // Without this the session cookie is dropped and Checkout 401s.
        credentials: "include",
        body: JSON.stringify({ price: "pro_yearly" }),
      }),
    );
    // Server-supplied failure copy reaches the user.
    expect(await screen.findByRole("alert")).toHaveTextContent(/nope/i);

    vi.unstubAllGlobals();
  });

  it("offers monthly as an alternative to the default yearly price", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderAccount({ billing: { canUpgrade: true } });
    await user.click(screen.getByRole("radio", { name: /monthly/i }));
    await user.click(screen.getByRole("button", { name: /upgrade to pro/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({ body: JSON.stringify({ price: "pro_monthly" }) }),
    );

    vi.unstubAllGlobals();
  });

  it("posts to the portal with the session cookie", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    renderAccount({ billing: { plan: "pro", canUpgrade: false, canManage: true } });
    await user.click(screen.getByRole("button", { name: /manage subscription/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/portal",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );

    vi.unstubAllGlobals();
  });
});

describe("AccountClient — danger zone", () => {
  it("requires two clicks to delete all audits, and Cancel disarms", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteAllAudits).mockResolvedValue({ ok: true });
    renderAccount({ hasPassword: true });

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
    renderAccount({ hasPassword: true });

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
    renderAccount({ hasPassword: false });

    await user.click(screen.getByRole("button", { name: /^delete account$/i }));

    // OAuth branch renders no password field; deletion confirms directly.
    expect(screen.queryByLabelText(/confirm your password/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /permanently delete account/i }));

    expect(authClient.deleteUser).toHaveBeenCalledWith({});
  });
});
