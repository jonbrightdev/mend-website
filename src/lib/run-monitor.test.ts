import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { audit, monitor, user, violation } from "@/db/schema";
import type { IngestPayload } from "@/lib/ingest-payload";

// run-monitor reaches "@/db", so it is imported dynamically in beforeAll —
// after createTestDb() has seeded the global instance.
let db: Awaited<ReturnType<typeof createTestDb>>;
let runMonitor: typeof import("@/lib/run-monitor").runMonitor;

const TARGET = {
  id: "mon-1",
  userId: "rm-owner",
  url: "https://example.com/pricing",
};

function payload(over: Partial<IngestPayload> = {}): IngestPayload {
  return {
    url: TARGET.url,
    pageTitle: "Pricing",
    scannedAt: new Date("2026-07-20T09:00:00.000Z"),
    durationMs: 1200,
    totalChecks: 40,
    partial: false,
    issues: [
      {
        ruleId: "image-alt",
        impact: "critical",
        category: "images",
        wcag: ["1.1.1"],
        title: "Images must have alternative text",
        description: "",
        selector: "img.hero",
        html: "<img>",
        domOrder: 0,
      },
    ],
    ...over,
  };
}

async function seedMonitor(nextRun: Date) {
  await db.delete(monitor);
  await db.delete(audit);
  await db.insert(monitor).values({
    id: TARGET.id,
    userId: TARGET.userId,
    url: TARGET.url,
    nextRunAt: nextRun,
    lastError: "a previous failure",
  });
}

async function monitorRow() {
  const rows = await db.select().from(monitor).where(eq(monitor.id, TARGET.id));
  return rows[0]!;
}

beforeAll(async () => {
  db = await createTestDb();
  ({ runMonitor } = await import("@/lib/run-monitor"));
  await db
    .insert(user)
    .values({ id: TARGET.userId, name: "Owner", email: "rm@example.com" });
});

beforeEach(async () => {
  // Start each case with a monitor that is overdue and carrying a stale error.
  await seedMonitor(new Date("2020-01-01T00:00:00.000Z"));
});

describe("runMonitor — success", () => {
  it("stores the scan as an ordinary audit with its violations", async () => {
    const result = await runMonitor(TARGET, async () => payload());

    expect(result).toEqual({ ok: true, error: null });

    const audits = await db.select().from(audit);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.url).toBe(TARGET.url);
    expect(audits[0]!.userId).toBe(TARGET.userId);

    // Grouped through the same path as an extension run.
    const violations = await db.select().from(violation);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.ruleId).toBe("image-alt");
  });

  it("clears the previous error and records the run time", async () => {
    await runMonitor(TARGET, async () => payload());

    const row = await monitorRow();
    expect(row.lastError).toBeNull();
    expect(row.lastRunAt).not.toBeNull();
  });

  it("reschedules into tomorrow's UTC day", async () => {
    await runMonitor(TARGET, async () => payload());

    const row = await monitorRow();
    expect(row.nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("is idempotent for a repeated scannedAt", async () => {
    await runMonitor(TARGET, async () => payload());
    await runMonitor(TARGET, async () => payload());

    // Same (userId, url, scannedAt) — the second run hits the conflict path
    // rather than duplicating the audit.
    expect(await db.select().from(audit)).toHaveLength(1);
  });
});

describe("runMonitor — failure", () => {
  const boom = async () => {
    throw new Error("page.goto: Timeout 45000ms exceeded");
  };

  it("records the error instead of throwing", async () => {
    const result = await runMonitor(TARGET, boom);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Timeout 45000ms exceeded/);
    expect((await monitorRow()).lastError).toMatch(/Timeout 45000ms exceeded/);
  });

  it("writes no audit", async () => {
    await runMonitor(TARGET, boom);
    expect(await db.select().from(audit)).toHaveLength(0);
  });

  // The important one: a permanently-broken page must not hot-loop through
  // every scheduler tick.
  it("still advances nextRunAt", async () => {
    await runMonitor(TARGET, boom);

    const row = await monitorRow();
    expect(row.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(row.lastRunAt).not.toBeNull();
  });

  it("clips a very long error message", async () => {
    await runMonitor(TARGET, async () => {
      throw new Error("x".repeat(2000));
    });

    expect((await monitorRow()).lastError).toHaveLength(500);
  });

  it("survives a thrown non-Error", async () => {
    await runMonitor(TARGET, async () => {
      throw "just a string";
    });

    expect((await monitorRow()).lastError).toBe("just a string");
  });

  it("rejects a private-network target through the scanner's guard", async () => {
    // The real scanPage calls assertScannableUrl first, so a monitor whose URL
    // somehow got past addMonitor still cannot be used to reach localhost.
    const { scanPage } = await import("@/lib/scan/scanner");
    await expect(scanPage("http://127.0.0.1:8080/")).rejects.toThrow(
      /private or local network/i,
    );
  });
});
