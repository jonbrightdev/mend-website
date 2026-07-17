import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { audit, user, violation } from "@/db/schema";

// Characterization tests for getDashboardData: they pin the CURRENT behaviour
// (run days, carry-forward history, same-day-last-run-wins, latest-run
// violations, user isolation) so the query rewrite in plan 015 is provably
// like-for-like. getDashboardData imports "@/db", so it is imported
// dynamically in beforeAll — after createTestDb() seeds the global instance.

let db: Awaited<ReturnType<typeof createTestDb>>;
let getDashboardData: (
  userId: string,
) => Promise<{ audits: import("@/lib/dashboard-data").AuditRecord[]; runDates: string[] }>;

// Seeds one run and one violation per entry in `nodeCounts` (each with that many
// nodes), so a run's node total is the sum of nodeCounts. An empty array seeds a
// run with no violations at all.
async function seedRun(
  id: string,
  userId: string,
  url: string,
  scannedAt: string,
  nodeCounts: number[],
) {
  await db.insert(audit).values({
    id,
    userId,
    url,
    pageTitle: url,
    scannedAt: new Date(scannedAt),
  });
  for (const [i, count] of nodeCounts.entries()) {
    await db.insert(violation).values({
      id: `${id}-v${i}`,
      auditId: id,
      ruleId: i === 0 ? "image-alt" : "color-contrast",
      impact: "critical",
      help: "Images must have alternative text",
      helpUrl: "",
      description: "",
      tags: [],
      nodes: Array.from({ length: count }, (_, n) => ({
        target: `#n${n}`,
        html: "<img>",
        failureSummary: "no alt",
      })),
    });
  }
}

describe("getDashboardData", () => {
  beforeAll(async () => {
    db = await createTestDb();
    ({ getDashboardData } = await import("@/lib/dashboard-queries"));
    await db.insert(user).values([
      { id: "u-a", name: "Ada", email: "a@example.com" },
      { id: "u-b", name: "Bo", email: "b@example.com" },
      { id: "u-many", name: "Cy", email: "c@example.com" },
      { id: "u-none", name: "Di", email: "d@example.com" },
    ]);

    // u-a, https://a.example/: 3 nodes (2 violations) on day1, 1 node on day2,
    // zero violations on day4 — nothing on day3 (carry-forward case).
    await seedRun("a1", "u-a", "https://a.example/", "2026-07-01T09:00:00.000Z", [2, 1]);
    await seedRun("a2", "u-a", "https://a.example/", "2026-07-02T09:00:00.000Z", [1]);
    await seedRun("a3", "u-a", "https://a.example/", "2026-07-04T09:00:00.000Z", []);

    // u-a, https://b.example/: 2 nodes on day2, then twice on day3 (5 then 4) —
    // the later day3 run must win.
    await seedRun("b1", "u-a", "https://b.example/", "2026-07-02T09:00:00.000Z", [2]);
    await seedRun("b2", "u-a", "https://b.example/", "2026-07-03T10:00:00.000Z", [5]);
    await seedRun("b3", "u-a", "https://b.example/", "2026-07-03T14:00:00.000Z", [4]);

    // u-b: a single unrelated run (isolation).
    await seedRun("c1", "u-b", "https://c.example/", "2026-07-02T09:00:00.000Z", [7]);

    // u-many: 10 distinct run days on one URL (run-date cap case).
    for (let d = 0; d < 10; d++) {
      const day = String(20 + d).padStart(2, "0");
      await seedRun(`m${d}`, "u-many", "https://m.example/", `2026-06-${day}T09:00:00.000Z`, [d + 1]);
    }
  });

  it("computes run days, carry-forward history, and latest-run violations", async () => {
    const { audits, runDates } = await getDashboardData("u-a");

    expect(runDates).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]);

    // Newest scan first: a.example's latest is day4, b.example's is day3.
    expect(audits.map((a) => a.url)).toEqual([
      "https://a.example/",
      "https://b.example/",
    ]);

    const a = audits[0]!;
    expect(a.history).toEqual([3, 1, 1, 0]); // day1=3, day2=1, day3 carries 1, day4=0
    expect(a.violations).toHaveLength(0); // latest run (a3) had none

    const b = audits[1]!;
    expect(b.history).toEqual([0, 2, 4, 4]); // 0 before first run; day3's last run (4) wins and carries
    expect(b.violations).toHaveLength(1);
    expect(b.violations[0]!.nodes).toHaveLength(4); // latest run b3's payload
  });

  it("isolates one user's data from another's", async () => {
    const { audits } = await getDashboardData("u-b");
    expect(audits.map((a) => a.url)).toEqual(["https://c.example/"]);
    expect(audits[0]!.history).toEqual([7]);
  });

  it("caps run days at the most recent 8", async () => {
    const { audits, runDates } = await getDashboardData("u-many");
    expect(runDates).toHaveLength(8);
    expect(runDates[0]).toBe("2026-06-22"); // first two of the ten days dropped
    expect(runDates.at(-1)).toBe("2026-06-29");
    expect(audits[0]!.history).toHaveLength(8);
  });

  it("returns empty results for a user with no runs", async () => {
    expect(await getDashboardData("u-none")).toEqual({ audits: [], runDates: [] });
  });
});
