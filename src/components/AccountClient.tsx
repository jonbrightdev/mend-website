import { useState } from "react";
import {
  createApiKey,
  revokeApiKey,
  type ApiKeyRow,
} from "@/lib/account-fns";

// "Connect extension" panel. Generates an API key (shown once), lists existing
// keys, and revokes them. The key is what the Mend extension pastes into its
// settings to sync audits to this account.
export function AccountClient({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeKeys = keys.filter((k) => !k.revokedAt);

  async function onGenerate() {
    setError(null);
    setPending(true);
    try {
      const { key, keys: next } = await createApiKey({ data: "Chrome extension" });
      setKeys(next);
      setFreshKey(key);
      setCopied(false);
    } catch {
      setError("Couldn't create a key. Please try again.");
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
    <section className="section" aria-labelledby="connect-h">
      <div className="wrap">
        <p className="eyebrow">Extension</p>
        <h2 id="connect-h">Connect the Mend extension</h2>
        <p className="lede">
          Generate a key, paste it into the extension&apos;s settings, and the
          audits you choose to save will appear on your dashboard.
        </p>

        <div className="callout" style={{ margin: "1rem 0 1.6rem" }}>
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
            <p>
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
          <button
            className="btn btn--primary btn--lg"
            type="button"
            disabled={pending}
            onClick={onGenerate}
          >
            {pending ? "Generating…" : "Generate a key"}
          </button>
        )}

        <h3 style={{ marginTop: "2rem" }}>Your keys</h3>
        {activeKeys.length === 0 ? (
          <p className="muted">No active keys. Generate one to connect.</p>
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
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
