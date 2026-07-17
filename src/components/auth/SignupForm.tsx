import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { authFeatures } from "@/lib/auth-features";

const errorStyle = {
  color: "var(--sev-critical)",
  margin: "0 0 1rem",
  fontWeight: 600,
} as const;

export function SignupForm() {
  const [name, setName] = useState("");
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

  const oauthVisible =
    authFeatures.google || authFeatures.github || authFeatures.magicLink;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
    });
    setPending(false);
    if (signUpError) {
      setError(
        signUpError.message ??
          "Could not create your account. Try a different email or password.",
      );
      return;
    }
    window.location.href = "/dashboard";
  }

  async function onSocial(provider: "google" | "github") {
    setError(null);
    await authClient.signIn.social({
      provider,
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
        <p>We sent a link to confirm your account to</p>
        <p className="sent-to">{sentTo}</p>
        <p style={{ marginTop: "1rem" }}>
          Open it to finish setting up. The link expires in 15 minutes.
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
      <h2>Create your account</h2>
      <p className="auth-card__sub">Free, forever. No card, no team setup.</p>

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input
            className="input"
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder="Sam Rivera"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

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
          <label htmlFor="password">Password</label>
          <div className="pw-wrap">
            <input
              className="input"
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              aria-describedby="pwHint"
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
          <p className="field__hint" id="pwHint">
            Use 8+ characters. A passphrase is great.
          </p>
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
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      {oauthVisible && (
        <>
          <div className="auth-sep">or</div>
          <div className="oauth-stack">
            {authFeatures.google && (
              <button
                className="btn btn--oauth"
                type="button"
                onClick={() => onSocial("google")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-7.8Z" />
                  <path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.7l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23Z" />
                  <path fill="#FBBC05" d="M6 14.3a6.6 6.6 0 0 1 0-4.2V7.3H2.3a11 11 0 0 0 0 9.8L6 14.3Z" />
                  <path fill="#EA4335" d="M12 5.5c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.3L6 10.1c.9-2.6 3.2-4.6 6-4.6Z" />
                </svg>
                Sign up with Google
              </button>
            )}
            {authFeatures.github && (
              <button
                className="btn btn--oauth"
                type="button"
                onClick={() => onSocial("github")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M12 .5A11.5 11.5 0 0 0 .5 12.27c0 5.2 3.3 9.6 7.86 11.16.58.11.79-.26.79-.57v-2c-3.2.71-3.87-1.58-3.87-1.58-.53-1.36-1.28-1.72-1.28-1.72-1.05-.73.08-.72.08-.72 1.16.08 1.77 1.21 1.77 1.21 1.03 1.8 2.7 1.28 3.36.98.1-.76.4-1.28.73-1.57-2.55-.3-5.23-1.31-5.23-5.82 0-1.29.45-2.34 1.19-3.16-.12-.3-.52-1.5.11-3.12 0 0 .97-.32 3.18 1.21a10.8 10.8 0 0 1 5.78 0c2.2-1.53 3.17-1.21 3.17-1.21.63 1.62.23 2.82.12 3.12.74.82 1.18 1.87 1.18 3.16 0 4.52-2.68 5.51-5.24 5.8.41.36.78 1.08.78 2.18v3.23c0 .31.2.68.8.57A11.77 11.77 0 0 0 23.5 12.27 11.5 11.5 0 0 0 12 .5Z" />
                </svg>
                Sign up with GitHub
              </button>
            )}
            {authFeatures.magicLink && (
              <button className="btn btn--oauth" type="button" onClick={onMagicLink}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#a23a1c" strokeWidth="1.8" />
                  <path d="m4 7 8 6 8-6" stroke="#a23a1c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign up with a magic link
              </button>
            )}
          </div>
        </>
      )}

      <p className="auth-foot">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
