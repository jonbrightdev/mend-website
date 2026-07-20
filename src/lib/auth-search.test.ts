import { describe, it, expect } from "vitest";
import { validateAuthSearch } from "./auth-search";

describe("validateAuthSearch", () => {
  it("accepts the one flag it knows", () => {
    expect(validateAuthSearch({ from: "extension" })).toEqual({ from: "extension" });
  });

  it("drops anything else, including URLs", () => {
    // The point of a fixed flag: no user-supplied value can survive into a
    // destination, so there is nothing to open-redirect with.
    for (const from of [
      "evil",
      "https://evil.example/steal",
      "//evil.example",
      "/dashboard",
      "Extension",
      "",
      42,
      null,
      undefined,
      { from: "extension" },
      ["extension"],
    ]) {
      expect(validateAuthSearch({ from })).toEqual({ from: undefined });
    }
  });

  it("drops unrelated params entirely", () => {
    expect(validateAuthSearch({ next: "/admin", redirect: "https://evil.example" })).toEqual(
      { from: undefined },
    );
  });
});
