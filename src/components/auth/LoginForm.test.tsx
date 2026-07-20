// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";
import { authClient } from "@/lib/auth-client";

// Same mocking shape as SignupForm.test.tsx — see the comments there.
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
      oauth2: vi.fn(),
      magicLink: vi.fn(),
    },
  },
}));
vi.mock("@/lib/auth-features", () => ({
  authFeatures: { google: true, github: true, magicLink: true },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  // biome-ignore lint/suspicious/noExplicitAny: minimal Link stand-in for tests.
  Link: ({ to, search, children, ...rest }: any) => (
    <a href={search?.from ? `${to}?from=${search.from}` : to} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

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
  await user.type(screen.getByLabelText(/email/i), "sam@example.dev");
  await user.type(screen.getByLabelText(/^password$/i), "hunter2hunter2");
  await user.click(screen.getByRole("button", { name: /^log in$/i }));
}

describe("LoginForm — destinations", () => {
  it("lands on the dashboard by default", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null } as never);
    render(<LoginForm />);

    await fillAndSubmit();

    expect(navigatedTo).toBe("/dashboard");
  });

  it("lands on /account?from=extension for extension arrivals", async () => {
    vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null } as never);
    render(<LoginForm fromExtension />);

    await fillAndSubmit();

    expect(navigatedTo).toBe("/account?from=extension");
  });

  it("passes the destination as callbackURL to Google, GitHub and magic link", async () => {
    const user = userEvent.setup();
    vi.mocked(authClient.signIn.magicLink).mockResolvedValue({ error: null } as never);
    render(<LoginForm fromExtension />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(authClient.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/account?from=extension",
    });

    await user.click(screen.getByRole("button", { name: /continue with github/i }));
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
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(authClient.signIn.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/dashboard",
    });
  });

  it("preserves the flag on the 'Create an account' footer link, and omits it otherwise", () => {
    const { unmount } = render(<LoginForm fromExtension />);
    expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute(
      "href",
      "/signup?from=extension",
    );
    unmount();

    render(<LoginForm />);
    expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
