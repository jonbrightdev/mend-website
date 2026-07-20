import { describe, expect, it } from "vitest";
import { assertScannableUrl } from "@/lib/scan/url-guard";

describe("assertScannableUrl", () => {
  const accepted = [
    "https://example.com/",
    "http://example.com/pricing?a=1",
    "https://sub.domain.example.co.uk/deep/path",
    "https://example.com:8443/",
    // Public IP literals are fine — the guard blocks private ranges, not IPs.
    "https://8.8.8.8/",
    "https://172.32.0.1/", // just outside 172.16/12
    "https://192.169.0.1/", // just outside 192.168/16
  ];

  for (const url of accepted) {
    it(`accepts ${url}`, () => {
      expect(() => assertScannableUrl(url)).not.toThrow();
    });
  }

  const privateAddresses = [
    "http://localhost/",
    "http://localhost:3000/",
    "http://LOCALHOST/",
    "http://127.0.0.1/",
    "http://127.1.2.3/",
    "http://10.0.0.1/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://0.0.0.0/",
    // The one that matters most: cloud instance metadata.
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
  ];

  for (const url of privateAddresses) {
    it(`rejects ${url} as private`, () => {
      expect(() => assertScannableUrl(url)).toThrow(/private or local network/i);
    });
  }

  // Zero-padded and non-decimal spellings are a classic bypass; the guard
  // rejects them outright rather than trying to normalize them.
  it("rejects zero-padded loopback spellings", () => {
    expect(() => assertScannableUrl("http://0177.0.0.1/")).toThrow();
  });

  const wrongScheme = [
    "file:///etc/passwd",
    "ftp://example.com/",
    "gopher://example.com/",
    "javascript:alert(1)",
  ];

  for (const url of wrongScheme) {
    it(`rejects ${url} for its scheme`, () => {
      expect(() => assertScannableUrl(url)).toThrow(/only http/i);
    });
  }

  it("rejects a string that isn't a URL at all", () => {
    expect(() => assertScannableUrl("not a url")).toThrow(/valid URL/i);
    expect(() => assertScannableUrl("example.com")).toThrow(/valid URL/i);
  });

  it("returns the parsed URL on success", () => {
    expect(assertScannableUrl("https://example.com/a").hostname).toBe("example.com");
  });
});
