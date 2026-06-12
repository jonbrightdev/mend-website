import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { authFeatures } from "@/lib/auth-features";

const errorStyle = {
  color: "var(--sev-critical)",
  margin: "0 0 1rem",
  fontWeight: 600,
} as const;

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sentTo) sentHeadingRef.current?.focus();
  }, [sentTo]);

  const oauthVisible = authFeatures.google || authFeatures.magicLink;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });
    setPending(false);
    if (signInError) {
      setError(
        signInError.message ??
          "Could not sign you in. Check your details and try again.",
      );
      return;
    }
    window.location.href = "/dashboard";
  }

  async function onGoogle() {
    setError(null);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  }

  async function onMagicLink() {
    const value = email.trim();
    if (!value) {
      setError("Enter your email first, then request a magic link.");
      return;
    }
    setError(null);
    setPending(true);
    const { error: linkError } = await authClient.signIn.magicLink({
      email: value,
      callbackURL: "/dashboard",
    });
    setPending(false);
    if (linkError) {
      setError(linkError.message ?? "Could not send the link. Try again.");
      return;
    }
    setSentTo(value);
  }

  if (sentTo) {
    return (
      <div className="auth-sent" role="status" aria-live="polite">
        <span className="auth-sent__ico" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 tabIndex={-1} ref={sentHeadingRef}>
          Check your inbox
        </h2>
        <p>We sent a one-time sign-in link to</p>
        <p className="sent-to">{sentTo}</p>
        <p style={{ marginTop: "1rem" }}>
          The link expires in 15 minutes. You can close this tab once you&apos;ve
          opened it.
        </p>
        <div className="state__cta" style={{ marginTop: ".6rem" }}>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setSentTo(null)}
          >
            Use a password instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>Log in</h2>
      <p className="auth-card__sub">
        Welcome back. Pick up where your audits left off.
      </p>

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            className="input"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@studio.dev"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="field__row">
            <label htmlFor="password">Password</label>
            {/* Password reset is wired alongside the email provider (see notes). */}
            <a href="#0">Forgot password?</a>
          </div>
          <div className="pw-wrap">
            <input
              className="input"
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              className="pw-toggle"
              type="button"
              aria-pressed={showPw}
              aria-controls="password"
              onClick={() => setShowPw((s) => !s)}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}

        <button
          className="btn btn--primary btn--lg btn--block"
          type="submit"
          disabled={pending}
        >
          {pending ? "Signing in…" : "Log in"}
        </button>
      </form>

      {oauthVisible && (
        <>
          <div className="auth-sep">or</div>
          <div className="oauth-stack">
            {authFeatures.google && (
              <button className="btn btn--oauth" type="button" onClick={onGoogle}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-7.8Z" />
                  <path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.7l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23Z" />
                  <path fill="#FBBC05" d="M6 14.3a6.6 6.6 0 0 1 0-4.2V7.3H2.3a11 11 0 0 0 0 9.8L6 14.3Z" />
                  <path fill="#EA4335" d="M12 5.5c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.3L6 10.1c.9-2.6 3.2-4.6 6-4.6Z" />
                </svg>
                Continue with Google
              </button>
            )}
            {authFeatures.magicLink && (
              <button className="btn btn--oauth" type="button" onClick={onMagicLink}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#a23a1c" strokeWidth="1.8" />
                  <path d="m4 7 8 6 8-6" stroke="#a23a1c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Email me a magic link
              </button>
            )}
          </div>
        </>
      )}

      <p className="auth-foot">
        New to Mend? <Link to="/signup">Create an account</Link>
      </p>
    </div>
  );
}
