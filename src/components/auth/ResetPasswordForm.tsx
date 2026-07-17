import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

const errorStyle = {
  color: "var(--sev-critical)",
  margin: "0 0 1rem",
  fontWeight: 600,
} as const;

// Better Auth's /reset-password/:token endpoint validates the token before
// redirecting here: a good one arrives as ?token=, an expired or already-spent
// one as ?error=INVALID_TOKEN with no token at all. Both mean "no usable token",
// so they share one dead-end screen.
export function ResetPasswordForm({ token }: { token?: string }) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setPending(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setPending(false);
    if (resetError) {
      setError(
        resetError.message ??
          "Could not reset your password. The link may have expired.",
      );
      return;
    }
    window.location.href = "/login";
  }

  if (!token) {
    return (
      <div>
        <h2>This link has expired</h2>
        <p className="auth-card__sub">
          Reset links last an hour and can only be used once. Request a fresh one
          and it&apos;ll be in your inbox shortly.
        </p>
        <Link className="btn btn--primary btn--lg btn--block" to="/forgot-password">
          Request a new link
        </Link>
        <p className="auth-foot">
          Remembered it? <Link to="/login">Log in</Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2>Set a new password</h2>
      <p className="auth-card__sub">
        Choose something you haven&apos;t used before. You&apos;ll log in with it
        next.
      </p>

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="password">New password</label>
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
          <>
            <p role="alert" style={errorStyle}>
              {error}
            </p>
            <p style={{ margin: "0 0 1rem" }}>
              <Link to="/forgot-password">Request a new link</Link>
            </p>
          </>
        )}

        <button
          className="btn btn--primary btn--lg btn--block"
          type="submit"
          disabled={pending}
        >
          {pending ? "Saving…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}
