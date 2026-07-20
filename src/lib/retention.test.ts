import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { audit, user, violation } from "@/db/schema";

// retention.ts imports "@/db", so it is imported dynamically in beforeAll —
// after createTestDb() has put the in-memory instance on globalThis for "@/db"
// to pick up.
//
// The throttle map is module state with no reset hook, so every test here uses
// its own userId. That is also how the real thing behaves: throttling is
// per-user, and a test that needed a reset would be testing the hook instead.

let db: Awaited<ReturnType<typeof createTestDb>>;
let maybePurgeOldAudits: typeof import("@/lib/retention").maybePurgeOldAudits;
let isRetentionPurgeEnabled: typeof import("@/lib/retention").isRetentionPurgeEnabled;

const NOW = Date.parse("2026-07-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

async function seedUser(id: string) {
  await db.insert(user).values({ id, name: "Ada", email: `${id}@example.com` });
}

/** One audit `daysAgo` before NOW, with a violation so the cascade is testable. */
async function seedAudit(id: string, userId: string, daysAgo: number) {
  await db.insert(audit).values({
    id,
    userId,
    url: `https://example.com/${id}`,
    pageTitle: id,
    scannedAt: new Date(NOW - daysAgo * DAY_MS),
  });
  await db.insert(violation).values({
    id: `v-${id}`,
    auditId: id,
    ruleId: "image-alt",
    impact: "critical",
    help: "Images must have alternative text",
    helpUrl: "",
    description: "",
    tags: [],
    nodes: [{ target: "img", html: "<img>", failureSummary: "no alt" }],
  });
}

async function auditIdsFor(userId: string): Promise<string[]> {
  const rows = await db.select().from(audit).where(eq(audit.userId, userId));
  return rows.map((r) => r.id).sort();
}

describe("maybePurgeOldAudits", () => {
  beforeAll(async () => {
    db = await createTestDb();
    const mod = await import("@/lib/retention");
    maybePurgeOldAudits = mod.maybePurgeOldAudits;
    isRetentionPurgeEnabled = mod.isRetentionPurgeEnabled;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("gates", () => {
    it("reads the flag as an exact 'true' string", () => {
      expect(isRetentionPurgeEnabled({ RETENTION_PURGE_ENABLED: "true" })).toBe(true);
      expect(isRetentionPurgeEnabled({ RETENTION_PURGE_ENABLED: "false" })).toBe(false);
      expect(isRetentionPurgeEnabled({ RETENTION_PURGE_ENABLED: "1" })).toBe(false);
      expect(isRetentionPurgeEnabled({ RETENTION_PURGE_ENABLED: "TRUE" })).toBe(false);
      expect(isRetentionPurgeEnabled({})).toBe(false);
    });

    // The whole point of the gate: main deploys with old data must not start
    // deleting it because entitlements happen to say 30 days.
    it("deletes nothing when RETENTION_PURGE_ENABLED is unset", async () => {
      await seedUser("u-ret-off");
      await seedAudit("a-ret-off", "u-ret-off", 400);

      const result = await maybePurgeOldAudits("u-ret-off", 30, () => NOW);

      expect(result).toEqual({ ran: false, reason: "disabled" });
      expect(await auditIdsFor("u-ret-off")).toEqual(["a-ret-off"]);
    });

    it("deletes nothing when retention is unlimited, even with the flag on", async () => {
      vi.stubEnv("RETENTION_PURGE_ENABLED", "true");
      await seedUser("u-ret-inf");
      await seedAudit("a-ret-inf", "u-ret-inf", 4000);

      const result = await maybePurgeOldAudits(
        "u-ret-inf",
        Number.POSITIVE_INFINITY,
        () => NOW,
      );

      expect(result).toEqual({ ran: false, reason: "unlimited" });
      expect(await auditIdsFor("u-ret-inf")).toEqual(["a-ret-inf"]);
    });
  });

  describe("when enabled", () => {
    it("deletes only audits older than the window, and their violations", async () => {
      vi.stubEnv("RETENTION_PURGE_ENABLED", "true");
      await seedUser("u-ret-on");
      await seedAudit("a-old", "u-ret-on", 31);
      await seedAudit("a-ancient", "u-ret-on", 900);
      await seedAudit("a-fresh", "u-ret-on", 29);
      // Exactly at the boundary: 30 days old is not *older than* the cutoff.
      await seedAudit("a-edge", "u-ret-on", 30);

      const result = await maybePurgeOldAudits("u-ret-on", 30, () => NOW);

      expect(result).toEqual({ ran: true, dryRun: false, deleted: 2 });
      expect(await auditIdsFor("u-ret-on")).toEqual(["a-edge", "a-fresh"]);

      // The cascade is the point: no orphaned violation rows survive.
      const orphans = await db
        .select()
        .from(violation)
        .where(eq(violation.auditId, "a-old"));
      expect(orphans).toHaveLength(0);
    });

    it("leaves other users' old audits alone", async () => {
      vi.stubEnv("RETENTION_PURGE_ENABLED", "true");
      await seedUser("u-ret-mine");
      await seedUser("u-ret-theirs");
      await seedAudit("a-mine", "u-ret-mine", 400);
      await seedAudit("a-theirs", "u-ret-theirs", 400);

      await maybePurgeOldAudits("u-ret-mine", 30, () => NOW);

      expect(await auditIdsFor("u-ret-mine")).toEqual([]);
      expect(await auditIdsFor("u-ret-theirs")).toEqual(["a-theirs"]);
    });

    // Ingest calls this on every successful write; without the throttle a busy
    // user would run a DELETE scan per audit.
    it("runs at most once per day per user, then again after 24h", async () => {
      vi.stubEnv("RETENTION_PURGE_ENABLED", "true");
      await seedUser("u-ret-throttle");
      await seedAudit("a-throttle-1", "u-ret-throttle", 400);

      const first = await maybePurgeOldAudits("u-ret-throttle", 30, () => NOW);
      expect(first).toEqual({ ran: true, dryRun: false, deleted: 1 });

      // A second audit ages out an hour later; the throttle holds it back.
      await seedAudit("a-throttle-2", "u-ret-throttle", 400);
      const second = await maybePurgeOldAudits(
        "u-ret-throttle",
        30,
        () => NOW + 60 * 60 * 1000,
      );
      expect(second).toEqual({ ran: false, reason: "throttled" });
      expect(await auditIdsFor("u-ret-throttle")).toEqual(["a-throttle-2"]);

      // A day later the window reopens and it is swept.
      const third = await maybePurgeOldAudits(
        "u-ret-throttle",
        30,
        () => NOW + DAY_MS + 1000,
      );
      expect(third).toEqual({ ran: true, dryRun: false, deleted: 1 });
      expect(await auditIdsFor("u-ret-throttle")).toEqual([]);
    });

    it("counts without deleting under RETENTION_PURGE_DRY_RUN", async () => {
      vi.stubEnv("RETENTION_PURGE_ENABLED", "true");
      vi.stubEnv("RETENTION_PURGE_DRY_RUN", "true");
      await seedUser("u-ret-dry");
      await seedAudit("a-dry-1", "u-ret-dry", 400);
      await seedAudit("a-dry-2", "u-ret-dry", 400);
      await seedAudit("a-dry-fresh", "u-ret-dry", 1);
      const log = vi.spyOn(console, "info").mockImplementation(() => {});

      const result = await maybePurgeOldAudits("u-ret-dry", 30, () => NOW);

      expect(result).toEqual({ ran: true, dryRun: true, wouldDelete: 2 });
      expect(await auditIdsFor("u-ret-dry")).toEqual(["a-dry-1", "a-dry-2", "a-dry-fresh"]);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("wouldDelete=2"));
      log.mockRestore();
    });
  });
});
