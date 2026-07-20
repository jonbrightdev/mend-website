// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupForm } from "./SignupForm";
import { authClient } from "@/lib/auth-client";

// Mock the auth boundary — better-auth would otherwise fetch. All three
// optional methods are turned on so the OAuth/magic-link buttons render.
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signUp: { email: vi.fn() },
    signIn: { social: vi.fn(), oauth2: vi.fn(), magicLink: vi.fn() },
  },
}));
vi.mock("@/lib/auth-features", () => ({
  authFeatures: { google: true, github: true, magicLink: true },
}));
// Mock Link so no router context is needed. Unlike AccountClient's stand-in
// this one renders `search` too — the footer link carrying ?from=extension is
// exactly what these tests check.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // biome-ignore lint/suspicious/noExplicitAny: minimal Link stand-in for tests.
  Link: ({ to, search, children, ...rest }: any) => (
    <a
      href={search?.from ? `${to}?from=${search.from}` : to}
      {...rest}
    >
      {children}
    </a>
  ),
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

// jsdom cannot navigate, so replace `location` with a recording stand-in and
// read back what the form assigned to `href`.
let navigatedTo: string | null = null;
beforeEach(() => {
  navigatedTo = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: "http://localhost",
      set href(value: string) {
        navigatedTo = value;
      },
    },
  });
});

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/name/i), "Sam");
  await user.type(screen.getByLabelText(/email/i), "sam@example.dev");
  await user.type(screen.getByLabelText("Password"), "hunter2hunter2");
  await user.click(screen.getByRole("button", { name: /create account/i }));
}

describe("SignupForm — destinations", () => {
  it("lands on the dashboard by default", async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({ error: null } as never);
    render(<SignupForm />);

    await fillAndSubmit();

    expect(navigatedTo).toBe("/dashboard");
  });

  it("lands on /account?from=extension for extension arrivals", async () => {
    vi.mocked(authClient.signUp.email).mockResolvedValue({ error: null } as never);
    render(<SignupForm fromExtension />);

    await fillAndSubmit();

    expect(navigatedTo).toBe("/account?from=extension");
  });

  it("passes the destination as callbackURL to Google, GitHub and magic link", async () => {
    const user = userEvent.setup();
    vi.mocked(authClient.signIn.magicLink).mockResolvedValue({ error: null } as never);
    render(<SignupForm fromExtension />);

    await user.click(screen.getByRole("button", { name: /sign up with google/i }));
    expect(authClient.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/account?from=extension",
    });

    await user.click(screen.getByRole("button", { name: /sign up with github/i }));
    expect(authClient.signIn.oauth2).toHaveBeenCalledWith({
      providerId: "github",
      callbackURL: "/account?from=extension",
    });

    await user.type(screen.getByLabelText(/email/i), "sam@example.dev");
    await user.click(screen.getByRole("button", { name: /magic link/i }));
    expect(authClient.signIn.magicLink).toHaveBeenCalledWith({
      email: "sam@example.dev",
      callbackURL: "/account?from=extension",
    });
  });

  it("keeps /dashboard as the callbackURL without the flag", async () => {
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.click(screen.getByRole("button", { name: /sign up with google/i }));

    expect(authClient.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/dashboard",
    });
  });

  it("preserves the flag on the 'Log in' footer link, and omits it otherwise", () => {
    const { unmount } = render(<SignupForm fromExtension />);
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute(
      "href",
      "/login?from=extension",
    );
    unmount();

    render(<SignupForm />);
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
