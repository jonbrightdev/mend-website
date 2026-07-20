/* ============================================================
   Monitors fetch user-supplied URLs *from our server*, which makes
   them an SSRF surface: without a guard, "http://169.254.169.254/"
   would let anyone point our scanner at cloud metadata.

   v1 scope is deliberately literal-IP only — see the plan's
   maintenance notes. A DNS name that resolves to a private address
   still gets through, which is accepted for now: the load happens
   in a browser sandbox and the response body is never returned to
   the user, only axe findings. Do not "fix" this with a resolver
   check without deciding what it does to intranet-hosted staging
   monitors first.
   ============================================================ */

// Pure — no db, no network. Safe to call from queries and from the scanner.

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", ""]);

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => {
    // Reject anything that isn't plain decimal, so "010.1.1.1" or "1e2.0.0.1"
    // can't slip past as a differently-spelled loopback.
    if (!/^\d{1,3}$/.test(p)) return Number.NaN;
    return Number(p);
  });
  if (octets.some((n) => Number.isNaN(n) || n > 255)) return false;
  const [a, b] = octets as [number, number, number, number];

  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // 127/8 loopback
  if (a === 0) return true; // 0/8 "this network"
  if (a === 169 && b === 254) return true; // 169.254/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  return false;
}

function isPrivateIPv6(host: string): boolean {
  // URL.hostname keeps IPv6 literals in brackets.
  const inner = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!inner.includes(":")) return false;
  if (inner === "::1" || inner === "::") return true; // loopback / unspecified
  if (inner.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(inner)) return true; // fc00::/7 unique-local
  // IPv4-mapped addresses inherit the v4 verdict. WHATWG URL parsing rewrites
  // the dotted form "::ffff:127.0.0.1" into hex ("::ffff:7f00:1"), so by the
  // time a hostname reaches us it is normally the hex spelling — accept both.
  const dotted = /^::ffff:([\d.]+)$/.exec(inner);
  if (dotted?.[1]) return isPrivateIPv4(dotted[1]);

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(inner);
  if (hex?.[1] && hex[2]) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return isPrivateIPv4(
      [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
    );
  }
  return false;
}

/**
 * Throws with user-readable copy unless `url` is a public http(s) address we
 * are willing to point a browser at. Returns the parsed URL on success.
 */
export function assertScannableUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// pages can be monitored.");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    isPrivateIPv4(host) ||
    isPrivateIPv6(host)
  ) {
    throw new Error(
      "That address is on a private or local network, so Mend's servers can't reach it.",
    );
  }

  return parsed;
}
