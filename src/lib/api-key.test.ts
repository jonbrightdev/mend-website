import { describe, expect, it } from "vitest";
import { generateKey, hashKey } from "@/lib/api-key";

describe("generateKey", () => {
  it("returns a mend_-prefixed base64url key", () => {
    // 32 CSPRNG bytes → 43 base64url chars once padding is stripped.
    expect(generateKey()).toMatch(/^mend_[A-Za-z0-9_-]{43}$/);
  });

  it("returns a different key on every call", () => {
    expect(generateKey()).not.toBe(generateKey());
  });
});

describe("hashKey", () => {
  it("returns SHA-256 as 64 lowercase hex characters", async () => {
    expect(await hashKey("mend_test")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", async () => {
    expect(await hashKey("mend_test")).toBe(await hashKey("mend_test"));
  });

  it("differs for different inputs", async () => {
    expect(await hashKey("mend_test")).not.toBe(await hashKey("mend_other"));
  });
});
