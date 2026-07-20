import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { monitor, user } from "@/db/schema";

// monitor-queries imports "@/db", so it is imported dynamically in beforeAll —
// after createTestDb() has seeded the global instance. A static import here
// would bind the module to the persisted ./.data/pglite instead.
let db: Awaited<ReturnType<typeof createTestDb>>;
let q: typeof import("@/lib/monitor-queries");

beforeAll(async () => {
  db = await createTestDb();
  q = await import("@/lib/monitor-queries");
  await db.insert(user).values([
    { id: "m-owner", name: "Owner", email: "owner@example.com" },
    { id: "m-other", name: "Other", email: "other@example.com" },
  ]);
});

beforeEach(async () => {
  await db.delete(monitor);
});

describe("addMonitor / listMonitors", () => {
  it("stores a monitor and reads it back as a client-safe row", async () => {
    const created = await q.addMonitor("m-owner", "https://example.com/pricing");

    expect(created.url).toBe("https://example.com/pricing");
    expect(created.pausedAt).toBeNull();
    expect(created.lastRunAt).toBeNull();
    expect(created.lastError).toBeNull();
    // Dates cross the wire as ISO strings, not Date objects.
    expect(typeof created.nextRunAt).toBe("string");

    const rows = await q.listMonitors("m-owner");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(created.id);
  });

  it("schedules the first run within the next 24 hours", async () => {
    const before = Date.now();
    const created = await q.addMonitor("m-owner", "https://example.com/");
    const next = new Date(created.nextRunAt).getTime();

    expect(next).toBeGreaterThan(before);
    expect(next).toBeLessThanOrEqual(before + 24 * 60 * 60 * 1000);
  });

  it("trims surrounding whitespace", async () => {
    const created = await q.addMonitor("m-owner", "  https://example.com/a  ");
    expect(created.url).toBe("https://example.com/a");
  });

  it("rejects a URL without an http(s) scheme", async () => {
    await expect(q.addMonitor("m-owner", "example.com")).rejects.toThrow(
      /starting with http/i,
    );
    await expect(q.addMonitor("m-owner", "ftp://example.com")).rejects.toThrow(
      /starting with http/i,
    );
  });

  it("rejects a URL longer than the ingest limit", async () => {
    const long = `https://example.com/${"a".repeat(2000)}`;
    await expect(q.addMonitor("m-owner", long)).rejects.toThrow(/too long/i);
  });

  it("rejects a duplicate URL for the same user with a friendly message", async () => {
    await q.addMonitor("m-owner", "https://example.com/dupe");
    await expect(q.addMonitor("m-owner", "https://example.com/dupe")).rejects.toThrow(
      /already monitoring/i,
    );
  });

  it("lets a different user monitor the same URL", async () => {
    await q.addMonitor("m-owner", "https://example.com/shared");
    await expect(
      q.addMonitor("m-other", "https://example.com/shared"),
    ).resolves.toMatchObject({ url: "https://example.com/shared" });
  });

  it("rejects the 11th monitor, counting paused ones", async () => {
    for (let i = 0; i < q.MAX_MONITORS; i++) {
      await q.addMonitor("m-owner", `https://example.com/p${i}`);
    }
    // Pausing does not free a slot — the cap is pages tracked, not runs due.
    const first = (await q.listMonitors("m-owner"))[0]!;
    await q.setPaused("m-owner", first.id, true);

    await expect(q.addMonitor("m-owner", "https://example.com/over")).rejects.toThrow(
      /up to 10 pages/i,
    );
  });

  it("counts the cap per user, not globally", async () => {
    for (let i = 0; i < q.MAX_MONITORS; i++) {
      await q.addMonitor("m-owner", `https://example.com/p${i}`);
    }
    await expect(
      q.addMonitor("m-other", "https://example.com/p0"),
    ).resolves.toBeDefined();
  });

  it("lists newest first, and only the caller's own monitors", async () => {
    const a = await q.addMonitor("m-owner", "https://example.com/one");
    const b = await q.addMonitor("m-owner", "https://example.com/two");
    await q.addMonitor("m-other", "https://example.com/theirs");
    // defaultNow() can hand both inserts the same instant, which leaves the
    // desc(createdAt) sort genuinely ambiguous — pin the timestamps so this
    // asserts the ordering rather than the clock's resolution.
    await db
      .update(monitor)
      .set({ createdAt: new Date("2026-07-01T00:00:00Z") })
      .where(eq(monitor.id, a.id));
    await db
      .update(monitor)
      .set({ createdAt: new Date("2026-07-02T00:00:00Z") })
      .where(eq(monitor.id, b.id));

    const rows = await q.listMonitors("m-owner");
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
  });
});

describe("setPaused", () => {
  it("sets pausedAt and clears it on resume", async () => {
    const created = await q.addMonitor("m-owner", "https://example.com/p");

    await q.setPaused("m-owner", created.id, true);
    expect((await q.listMonitors("m-owner"))[0]!.pausedAt).not.toBeNull();

    await q.setPaused("m-owner", created.id, false);
    expect((await q.listMonitors("m-owner"))[0]!.pausedAt).toBeNull();
  });

  it("re-rolls nextRunAt on resume so a long pause doesn't fire immediately", async () => {
    const created = await q.addMonitor("m-owner", "https://example.com/p");
    // Simulate a monitor paused long enough for its schedule to go stale.
    await db.update(monitor).set({ nextRunAt: new Date("2020-01-01T00:00:00Z") });

    await q.setPaused("m-owner", created.id, false);

    const next = new Date((await q.listMonitors("m-owner"))[0]!.nextRunAt).getTime();
    expect(next).toBeGreaterThan(Date.now());
  });

  it("cannot pause another user's monitor", async () => {
    const created = await q.addMonitor("m-owner", "https://example.com/p");

    await q.setPaused("m-other", created.id, true);

    expect((await q.listMonitors("m-owner"))[0]!.pausedAt).toBeNull();
  });
});

describe("claimDueMonitors", () => {
  const NOW = new Date("2026-07-20T12:00:00.000Z");

  // Bypasses addMonitor so a row can be planted with an arbitrary nextRunAt.
  async function plant(
    id: string,
    nextRun: string,
    over: { pausedAt?: Date; userId?: string } = {},
  ) {
    await db.insert(monitor).values({
      id,
      userId: over.userId ?? "m-owner",
      url: `https://example.com/${id}`,
      nextRunAt: new Date(nextRun),
      pausedAt: over.pausedAt ?? null,
    });
  }

  it("claims a due, unpaused monitor", async () => {
    await plant("due", "2026-07-20T11:00:00.000Z");

    const claimed = await q.claimDueMonitors(NOW, 20);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toEqual({
      id: "due",
      userId: "m-owner",
      url: "https://example.com/due",
    });
  });

  it("rolls the claimed monitor into tomorrow's UTC day", async () => {
    await plant("due", "2026-07-20T11:00:00.000Z");

    await q.claimDueMonitors(NOW, 20);

    const [row] = await db.select().from(monitor).where(eq(monitor.id, "due"));
    expect(row!.nextRunAt >= new Date("2026-07-21T00:00:00.000Z")).toBe(true);
    expect(row!.nextRunAt < new Date("2026-07-22T00:00:00.000Z")).toBe(true);
  });

  it("skips a monitor that is due but paused", async () => {
    await plant("paused", "2026-07-20T11:00:00.000Z", { pausedAt: NOW });
    expect(await q.claimDueMonitors(NOW, 20)).toHaveLength(0);
  });

  it("skips a monitor whose next run is still in the future", async () => {
    await plant("future", "2026-07-20T13:00:00.000Z");
    expect(await q.claimDueMonitors(NOW, 20)).toHaveLength(0);
  });

  it("claims a monitor due exactly now", async () => {
    await plant("boundary", "2026-07-20T12:00:00.000Z");
    expect(await q.claimDueMonitors(NOW, 20)).toHaveLength(1);
  });

  it("respects the limit, taking the longest-overdue first", async () => {
    await plant("oldest", "2026-07-20T08:00:00.000Z");
    await plant("middle", "2026-07-20T09:00:00.000Z");
    await plant("newest", "2026-07-20T10:00:00.000Z");

    const claimed = await q.claimDueMonitors(NOW, 2);

    expect(claimed.map((c) => c.id).sort()).toEqual(["middle", "oldest"]);
  });

  // The property the whole claim-then-run design rests on: once claimed, a
  // monitor is not due again, so a second ticker (or an overlapping tick)
  // cannot run it twice.
  it("claims nothing on an immediate second call", async () => {
    await plant("due", "2026-07-20T11:00:00.000Z");

    expect(await q.claimDueMonitors(NOW, 20)).toHaveLength(1);
    expect(await q.claimDueMonitors(NOW, 20)).toHaveLength(0);
  });

  it("sweeps across users — the scheduler is system-wide", async () => {
    await plant("mine", "2026-07-20T11:00:00.000Z");
    await plant("theirs", "2026-07-20T11:00:00.000Z", { userId: "m-other" });

    const claimed = await q.claimDueMonitors(NOW, 20);

    expect(claimed.map((c) => c.userId).sort()).toEqual(["m-other", "m-owner"]);
  });

  it("returns nothing when there is nothing to do", async () => {
    expect(await q.claimDueMonitors(NOW, 20)).toEqual([]);
  });
});

describe("deleteMonitor", () => {
  it("removes the monitor", async () => {
    const created = await q.addMonitor("m-owner", "https://example.com/p");
    await q.deleteMonitor("m-owner", created.id);
    expect(await q.listMonitors("m-owner")).toHaveLength(0);
  });

  it("allows re-adding a URL after deletion", async () => {
    const created = await q.addMonitor("m-owner", "https://example.com/p");
    await q.deleteMonitor("m-owner", created.id);
    await expect(q.addMonitor("m-owner", "https://example.com/p")).resolves.toBeDefined();
  });

  it("cannot delete another user's monitor", async () => {
    const created = await q.addMonitor("m-owner", "https://example.com/p");

    await q.deleteMonitor("m-other", created.id);

    expect(await q.listMonitors("m-owner")).toHaveLength(1);
  });
});
