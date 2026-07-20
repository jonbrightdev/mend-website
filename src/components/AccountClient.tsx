import { useState } from "react";
import {
  createApiKey,
  revokeApiKey,
  deleteAllAudits,
  type ApiKeyRow,
  type BillingSummary,
  type KeyQuota,
} from "@/lib/account-fns";
import { authClient } from "@/lib/auth-client";
import { BillingPanel } from "@/components/BillingPanel";

// "Connect extension" panel. Generates an API key (shown once), lists existing
// keys, and revokes them. The key is what the Mend extension pastes into its
// settings to sync audits to this account.
export function AccountClient({
  initialKeys,
  hasPassword,
  keyQuota,
  billing,
}: {
  initialKeys: ApiKeyRow[];
  hasPassword: boolean;
  keyQuota: KeyQuota;
  billing: BillingSummary;
}) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recomputed from the server's own key list after every generate/revoke, so
  // the cap follows the list rather than the stale loader snapshot. Only `max`
  // comes from the loader — it changes with the plan, not with this page.
  const activeKeys = keys.filter((k) => !k.revokedAt);
  const atCap = keyQuota.max !== null && activeKeys.length >= keyQuota.max;

  async function onGenerate() {
    setError(null);
    setPending(true);
    try {
      const { key, keys: next } = await createApiKey({ data: "Chrome extension" });
      setKeys(next);
      setFreshKey(key);
      setCopied(false);
      // Best-effort handoff to the extension: if its content script is
      // listening on this page (see ../mend-a11y/plans/007), it stores the
      // key directly and the user never needs the copy/paste below. Silently
      // a no-op if no listener is present — the manual field stays the
      // fallback either way. Target our own origin explicitly, never "*", so
      // the key can't be picked up by an unrelated listener.
      window.postMessage(
        { source: "mend-website", type: "MEND_API_KEY", apiKey: key },
        window.location.origin,
      );
    } catch (e) {
      // assertKeyQuota's message names the actual limit and the way out
      // ("Revoke one or upgrade to Pro"), which a generic string would throw
      // away. Fall back only when there is no message to show.
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't create a key. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function onRevoke(id: string) {
    setError(null);
    setPending(true);
    try {
      const { keys: next } = await revokeApiKey({ data: id });
      setKeys(next);
    } catch {
      setError("Couldn't revoke that key. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function onCopy() {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; the key is selectable in the field regardless.
    }
  }

  return (
    <>
    <BillingPanel billing={billing} />

    <section className="panel" aria-labelledby="connect-h">
      <div className="panel__head">
        <h2 id="connect-h">Connect the Mend extension</h2>
        {keyQuota.max !== null && (
          <span className="hint">
            {activeKeys.length} of {keyQuota.max} active keys
          </span>
        )}
      </div>
      <div className="panel__body">
        <p className="muted" style={{ marginTop: 0, maxWidth: "60ch" }}>
          Generate a key, paste it into the extension&apos;s Settings → “Save
          audits to my dashboard”, and the audits you choose to save will appear
          here.
        </p>

        <div className="callout" style={{ margin: "1rem 0 1.4rem" }}>
          <p>
            <strong>What syncing sends.</strong> Only the audits you explicitly
            save. Each one includes the page URL and title, and for every issue a
            CSS selector and a short HTML snippet of the failing element — which
            can contain real page content. Nothing is sent until you connect and
            choose to save a run.
          </p>
        </div>

        {error && (
          <p role="alert" style={{ color: "var(--sev-critical)", fontWeight: 600 }}>
            {error}
          </p>
        )}

        {freshKey ? (
          <div className="key-reveal" role="status" aria-live="polite">
            <p style={{ marginTop: 0 }}>
              <strong>Your new key.</strong> Copy it now — for your security it
              won&apos;t be shown again.
            </p>
            <div className="key-reveal__row">
              <input
                className="input"
                readOnly
                value={freshKey}
                aria-label="API key"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="btn btn--primary" type="button" onClick={onCopy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => setFreshKey(null)}
              style={{ marginTop: ".6rem" }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <button
              className="btn btn--primary"
              type="button"
              disabled={pending || atCap}
              onClick={onGenerate}
            >
              {pending ? "Generating…" : "Generate a key"}
            </button>
            {atCap && (
              <p className="muted" style={{ margin: ".6rem 0 0" }}>
                {billing.plan === "free"
                  ? "You've used every key your plan allows. Revoke one, or upgrade to Pro for more."
                  : "You've used every key your plan allows. Revoke one to add another."}
              </p>
            )}
          </>
        )}

        <h3 style={{ margin: "1.8rem 0 .5rem", fontSize: "1.05rem" }}>Your keys</h3>
        {activeKeys.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No active keys. Generate one to connect.
          </p>
        ) : (
          <ul className="key-list">
            {activeKeys.map((k) => (
              <li key={k.id} className="key-list__item">
                <div>
                  <div className="key-list__name">{k.name}</div>
                  <div className="key-list__meta">
                    Added {formatDate(k.createdAt)} ·{" "}
                    {k.lastUsedAt
                      ? `last used ${formatDate(k.lastUsedAt)}`
                      : "never used"}
                  </div>
                </div>
                <button
                  className="btn btn--ghost"
                  type="button"
                  disabled={pending}
                  onClick={() => onRevoke(k.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>

    <DangerZone hasPassword={hasPassword} />
    </>
  );
}

// The account page's destructive actions: delete all synced audits, or the
// whole account. Each action arms on the first click (a second click confirms)
// so there is no accidental one-tap deletion and no browser confirm() dialog.
function DangerZone({ hasPassword }: { hasPassword: boolean }) {
  const [armed, setArmed] = useState<null | "audits" | "account">(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [auditsDeleted, setAuditsDeleted] = useState(false);
  const [password, setPassword] = useState("");

  function disarm() {
    setArmed(null);
    setError(null);
    setPassword("");
  }

  async function onDeleteAudits() {
    setError(null);
    setPending(true);
    try {
      await deleteAllAudits({ data: undefined });
      setAuditsDeleted(true);
      setArmed(null);
    } catch {
      setError("Couldn't delete your audits. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function onDeleteAccount() {
    setError(null);
    setPending(true);
    try {
      // Email+password accounts must re-verify with their password. OAuth-only
      // accounts have no password, so Better Auth instead requires a fresh
      // session (signed in within 24 h). On success Better Auth clears the
      // session and the DB cascades remove the data.
      const { error: authError } = hasPassword
        ? await authClient.deleteUser({ password })
        : await authClient.deleteUser({});
      if (authError) {
        setError(
          authError.code === "SESSION_EXPIRED"
            ? "For security, deleting your account needs a recent sign-in. Sign out, sign back in, then try again."
            : authError.message ?? "Couldn't delete your account.",
        );
        setPending(false);
        return;
      }
      // Hard navigation so no stale authed UI lingers (matches SignOutButton).
      window.location.href = "/";
    } catch {
      setError("Couldn't delete your account. Please try again.");
      setPending(false);
    }
  }

  return (
    <section className="panel panel--danger" aria-labelledby="danger-h">
      <div className="panel__head">
        <h2 id="danger-h">Delete your data</h2>
      </div>
      <div className="panel__body">
        <p className="muted" style={{ marginTop: 0, maxWidth: "60ch" }}>
          Synced audits can include snippets of real page content. You can remove
          them — or your whole account — at any time. Deletion is immediate and
          permanent.
        </p>

        {error && (
          <p role="alert" style={{ color: "var(--sev-critical)", fontWeight: 600 }}>
            {error}
          </p>
        )}

        <div className="danger-action">
          <h3>Export your data</h3>
          <p>
            Download everything Mend has stored for your account — audits,
            violations, and API-key names — as JSON.
          </p>
          <a className="btn btn--ghost" href="/api/export">
            Download JSON
          </a>
        </div>

        <div className="danger-action">
          <h3>Delete all synced audits</h3>
          <p>
            Removes every audit run saved to this dashboard, and the issue
            snippets they contain. Your account and keys stay.
          </p>
          {auditsDeleted ? (
            <p role="status" style={{ margin: 0, fontWeight: 600 }}>
              All synced audits deleted.
            </p>
          ) : armed === "audits" ? (
            <div className="danger-action__row">
              <button
                className="btn btn--danger"
                type="button"
                disabled={pending}
                onClick={onDeleteAudits}
              >
                {pending ? "Deleting…" : "Click again to confirm"}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={pending}
                onClick={disarm}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="btn btn--danger"
              type="button"
              onClick={() => {
                setError(null);
                setArmed("audits");
              }}
            >
              Delete all synced audits
            </button>
          )}
        </div>

        <div className="danger-action">
          <h3>Delete account</h3>
          <p>
            Permanently deletes your account, keys, and all synced audits. This
            can&apos;t be undone.
          </p>
          {armed === "account" && !hasPassword ? (
            <div className="danger-action__row">
              <button
                className="btn btn--danger"
                type="button"
                disabled={pending}
                onClick={onDeleteAccount}
              >
                {pending ? "Deleting…" : "Permanently delete account"}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                disabled={pending}
                onClick={disarm}
              >
                Cancel
              </button>
            </div>
          ) : armed === "account" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onDeleteAccount();
              }}
            >
              <div className="field" style={{ maxWidth: "22rem" }}>
                <label htmlFor="delete-pw">Confirm your password</label>
                <input
                  id="delete-pw"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="danger-action__row" style={{ marginTop: ".7rem" }}>
                <button
                  className="btn btn--danger"
                  type="submit"
                  disabled={pending || password.length === 0}
                >
                  {pending ? "Deleting…" : "Permanently delete account"}
                </button>
                <button
                  className="btn btn--ghost"
                  type="button"
                  disabled={pending}
                  onClick={disarm}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              className="btn btn--danger"
              type="button"
              onClick={() => {
                setError(null);
                setArmed("account");
              }}
            >
              Delete account
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
