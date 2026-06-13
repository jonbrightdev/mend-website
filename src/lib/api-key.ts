// API keys for the Mend extension. The extension authenticates to /api/ingest
// with `Authorization: Bearer <key>` instead of a session cookie (a cookie
// won't ride along on a cross-site request from a chrome-extension:// origin).
//
// We never store the key itself — only its SHA-256 hash. The plaintext is shown
// to the user exactly once at creation time; thereafter only the hash exists, so
// a leaked database row can't be turned back into a working key.

const PREFIX = "mend_";

/**
 * A fresh, opaque key: the `mend_` prefix plus 32 bytes of CSPRNG output in
 * base64url. The prefix makes the secret recognizable in logs/leak scanners.
 */
export function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return PREFIX + toBase64Url(bytes);
}

/** SHA-256 of the key as lowercase hex. Stored and compared; never reversible. */
export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
