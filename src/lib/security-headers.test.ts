/* ============================================================
   The CSP is the reason this file exists. A browser silently drops
   any directive it cannot parse and enforces nothing in its place,
   so a typo here is invisible in production — no error, no console
   warning, just a policy that quietly does less than it claims.
   ============================================================ */

import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  SECURITY_HEADERS,
  STRICT_TRANSPORT_SECURITY,
} from "@/lib/security-headers";

describe("CONTENT_SECURITY_POLICY", () => {
  const directives = new Map(
    CONTENT_SECURITY_POLICY.split(";").map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values.join(" ")];
    }),
  );

  it("blocks framing, which is what protects the dashboard's destructive controls", () => {
    expect(directives.get("frame-ancestors")).toBe("'none'");
  });

  it("locks base-uri, form-action and object-src", () => {
    expect(directives.get("base-uri")).toBe("'self'");
    expect(directives.get("form-action")).toBe("'self'");
    expect(directives.get("object-src")).toBe("'none'");
  });

  it("sets no script-src or default-src, which would break SSR hydration", () => {
    // TanStack Start inlines the dehydrated router state in a <script> tag.
    // Adding either directive without per-request nonces blocks it and breaks
    // every page — so their absence is deliberate, and worth failing on.
    expect(directives.has("script-src")).toBe(false);
    expect(directives.has("default-src")).toBe(false);
  });

  it("quotes every keyword value, since an unquoted one is silently dropped", () => {
    for (const value of directives.values()) {
      for (const token of value.split(/\s+/)) {
        if (["none", "self", "unsafe-inline", "unsafe-eval"].includes(token)) {
          throw new Error(`CSP keyword "${token}" must be quoted as '${token}'`);
        }
      }
    }
  });

  it("has no empty or duplicated directives", () => {
    const names = CONTENT_SECURITY_POLICY.split(";").map((d) => d.trim().split(/\s+/)[0] ?? "");
    expect(names.every((n) => n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("STRICT_TRANSPORT_SECURITY", () => {
  it("is at least a year, the floor scanners and preload lists expect", () => {
    const maxAge = Number(/max-age=(\d+)/.exec(STRICT_TRANSPORT_SECURITY)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31536000);
  });

  it("claims neither includeSubDomains nor preload", () => {
    // Both are effectively irreversible for the length of max-age and bind
    // subdomains that may not exist yet — an operator's call about the whole
    // domain, not a default. Turning either on should be a deliberate edit
    // that updates this test.
    expect(STRICT_TRANSPORT_SECURITY).not.toContain("includeSubDomains");
    expect(STRICT_TRANSPORT_SECURITY).not.toContain("preload");
  });
});

describe("SECURITY_HEADERS", () => {
  it("carries the headers the audit called out", () => {
    expect(Object.keys(SECURITY_HEADERS).sort()).toEqual([
      "Content-Security-Policy",
      "Permissions-Policy",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]);
  });

  it("keeps X-Frame-Options agreeing with the CSP rather than contradicting it", () => {
    // Two sources of truth for the same policy; a scanner reads the legacy
    // header, current browsers prefer frame-ancestors. They must not disagree.
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
  });

  it("denies the hardware features the site never asks for", () => {
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(PERMISSIONS_POLICY).toContain(`${feature}=()`);
    }
  });

  it("has no empty values", () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(value.length, `${name} is empty`).toBeGreaterThan(0);
    }
  });
});
