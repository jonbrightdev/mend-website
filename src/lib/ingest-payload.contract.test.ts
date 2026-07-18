// Guards the shared ingest contract in `contract/` (see contract/README.md):
// every fixture under fixtures/valid/ must parse, every fixture under
// fixtures/invalid/ must be rejected, and the doc's version line must be
// present so a shape change can't ship without a version bump. This is one
// half of the drift tripwire; the other half lives in ../mend-a11y's
// test/contract.test.ts, which asserts buildIngestPayload still produces
// fixtures/valid/canonical.json byte-for-byte.
//
// Pure: no database, no dynamic imports — just fs + parsePayload.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IngestError, parsePayload } from "@/lib/ingest-payload";

const CONTRACT_ROOT = resolve(import.meta.dirname, "../../contract");
const VALID_DIR = resolve(CONTRACT_ROOT, "fixtures/valid");
const INVALID_DIR = resolve(CONTRACT_ROOT, "fixtures/invalid");

function jsonFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function readFixture(dir: string, name: string): unknown {
  return JSON.parse(readFileSync(resolve(dir, name), "utf8"));
}

describe("ingest contract", () => {
  it("has CONTRACT_VERSION: 1 recorded in the README", () => {
    const readme = readFileSync(resolve(CONTRACT_ROOT, "README.md"), "utf8");

    expect(readme).toMatch(/CONTRACT_VERSION: 1/);
  });

  it("has at least 3 valid and 4 invalid fixtures", () => {
    expect(jsonFiles(VALID_DIR).length).toBeGreaterThanOrEqual(3);
    expect(jsonFiles(INVALID_DIR).length).toBeGreaterThanOrEqual(4);
  });

  for (const name of jsonFiles(VALID_DIR)) {
    it(`accepts valid/${name}`, () => {
      const body = readFixture(VALID_DIR, name);

      expect(() => parsePayload(body)).not.toThrow();
    });
  }

  for (const name of jsonFiles(INVALID_DIR)) {
    it(`rejects invalid/${name}`, () => {
      const body = readFixture(INVALID_DIR, name);

      expect(() => parsePayload(body)).toThrow(IngestError);
    });
  }

  // Not a committed fixture (see fixtures/invalid/NOTE.md): a 1001-issue
  // JSON file is unwieldy to review, so it's built here from the canonical
  // fixture's first issue instead.
  it("rejects more than 1000 issues (too-many-issues, generated)", () => {
    const canonical = readFixture(VALID_DIR, "canonical.json") as {
      issues: unknown[];
    };
    const firstIssue = canonical.issues[0];
    const body = {
      ...canonical,
      issues: Array.from({ length: 1001 }, () => firstIssue),
    };

    expect(() => parsePayload(body)).toThrow(IngestError);
    expect(() => parsePayload(body)).toThrow("too many issues (max 1000)");
  });
});
