import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

const errorStyle = {
  color: "var(--sev-critical)",
  margin: "0 0 1rem",
  fontWeight: 600,
} as const;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sentTo) sentHeadingRef.current?.focus();
  }, [sentTo]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    setError(null);
    setPending(true);
    const { error: resetError } = await authClient.requestPasswordReset({
      email: value,
      redirectTo: "/reset-password",
    });
    setPending(false);
    // Only a transport/server failure lands here. An unknown address still
    // succeeds — the server refuses to reveal whether an account exists, and
    // showing "no such account" here would hand that back to an attacker.
    if (resetError) {
      setError(resetError.message ?? "Could not send the link. Try again.");
      return;
    }
    setSentTo(value);
  }

  if (sentTo) {
    return (
      <div className="auth-sent" role="status" aria-live="polite">
        <span className="auth-sent__ico" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 tabIndex={-1} ref={sentHeadingRef}>
          Check your inbox
        </h2>
        <p>We sent a password reset link to</p>
        <p className="sent-to">{sentTo}</p>
        <p style={{ marginTop: "1rem" }}>
          If an account exists for that address, the link will arrive shortly. It
          expires in 1 hour.
        </p>
        <div className="state__cta" style={{ marginTop: ".6rem" }}>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => setSentTo(null)}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>Reset your password</h2>
      <p className="auth-card__sub">
        Enter your email and we&apos;ll send you a link to set a new password.
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
          {pending ? "Sending link…" : "Send reset link"}
        </button>
      </form>

      <p className="auth-foot">
        Remembered it? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
