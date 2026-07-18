import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { hashKey } from "@/lib/api-key";
import { apiKey, audit, user, violation } from "@/db/schema";

// Covers the write path of POST /api/ingest, which persists an audit run and
// its violations in one transaction. The schema tables are safe to import
// statically (they touch no connection), but the route pulls in "@/db", so it
// is imported dynamically in beforeAll — after createTestDb() has put the
// in-memory instance on globalThis for "@/db" to pick up.

const KEY = "mend_test_key";
const USER_ID = "u-ingest";

type Handler = (ctx: { request: Request }) => Promise<Response>;

let db: Awaited<ReturnType<typeof createTestDb>>;
let post: Handler;

function payload(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://example.com/pricing",
    pageTitle: "Pricing",
    startedAt: Date.parse("2026-07-01T12:00:00.000Z"),
    partial: false,
    issues: [
      {
        ruleId: "image-alt",
        impact: "critical",
        category: "cat.text-alternatives",
        wcag: ["1.1.1"],
        title: "Images must have alternative text",
        description: "Ensures <img> elements have alternate text",
        selector: "img.hero",
        html: "<img>",
        failureSummary: "no alt",
        domOrder: 0,
      },
      // Same rule as above: groupViolations folds these into one row.
      {
        ruleId: "image-alt",
        impact: "critical",
        category: "cat.text-alternatives",
        wcag: ["1.1.1"],
        title: "Images must have alternative text",
        description: "Ensures <img> elements have alternate text",
        selector: "img.logo",
        html: "<img>",
        failureSummary: "no alt",
        domOrder: 1,
      },
      {
        ruleId: "color-contrast",
        impact: "serious",
        category: "cat.color",
        wcag: ["1.4.3"],
        title: "Elements must have sufficient colour contrast",
        description: "Ensures contrast between foreground and background",
        selector: "a.cta",
        html: "<a>",
        failureSummary: "2.1:1",
        domOrder: 2,
      },
    ],
    ...overrides,
  };
}

function request(body: unknown, token = KEY): Request {
  return new Request("http://localhost/api/ingest", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ingest", () => {
  beforeAll(async () => {
    db = await createTestDb();
    await db.insert(user).values({ id: USER_ID, name: "Ada", email: "ada@example.com" });
    await db.insert(apiKey).values({
      id: "k-ingest",
      userId: USER_ID,
      hashedKey: await hashKey(KEY),
      name: "Test key",
    });

    const mod = await import("@/routes/api/ingest");
    // The route object carries its handlers on `options`; TanStack does not
    // export a type for that shape, hence the cast.
    post = (mod.Route as unknown as {
      options: { server: { handlers: { POST: Handler } } };
    }).options.server.handlers.POST;
  });

  it("writes the audit and its grouped violations together", async () => {
    const res = await post({ request: request(payload()) });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { auditId: string; violations: number };
    // Three issues, two distinct rules.
    expect(body.violations).toBe(2);

    const runs = await db.select().from(audit).where(eq(audit.id, body.auditId));
    const rows = await db.select().from(violation).where(eq(violation.auditId, body.auditId));

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ url: "https://example.com/pricing", userId: USER_ID });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.ruleId).sort()).toEqual(["color-contrast", "image-alt"]);
    // The two image-alt issues became two nodes on one violation.
    expect(rows.find((r) => r.ruleId === "image-alt")!.nodes).toHaveLength(2);
  });

  it("treats a re-sent run as an idempotent success without duplicating it", async () => {
    const body = payload({ url: "https://example.com/about" });
    const first = await post({ request: request(body) });
    expect(first.status).toBe(201);

    const second = await post({ request: request(body) });

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ duplicate: true });
    const runs = await db
      .select()
      .from(audit)
      .where(eq(audit.url, "https://example.com/about"));
    expect(runs).toHaveLength(1);
  });

  it("rejects a body over 1 MiB before parsing it", async () => {
    // Oversized via one huge field, so it is the body gate that trips rather
    // than any per-field cap in the parser.
    const res = await post({
      request: request(payload({ pageTitle: "x".repeat(1_000_001) })),
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Payload too large" });
  });

  it("still rejects a non-JSON body as a 400", async () => {
    const res = await post({
      request: new Request("http://localhost/api/ingest", {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: "not json",
      }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Body must be JSON" });
  });

  it("returns a CORS-visible JSON 500 when the transaction fails", async () => {
    // Distinct startedAt so the mocked-away insert can't collide with the
    // idempotency index used by other tests in this suite.
    const body = payload({ startedAt: Date.parse("2026-07-05T09:00:00.000Z") });
    const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("boom"));
    const res = await post({ request: request(body) });
    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const parsed = (await res.json()) as { error: string };
    expect(parsed.error).toMatch(/went wrong/i);
  });

  // The fix leans on the driver rolling a failed transaction back. If PGlite
  // ever stopped doing that, the handler could still half-write a run, so this
  // asserts the guarantee itself rather than the handler.
  it("rolls back the audit row when a later write in the transaction throws", async () => {
    const scannedAt = new Date("2026-07-03T12:00:00.000Z");

    await expect(
      db.transaction(async (tx) => {
        await tx.insert(audit).values({
          id: "a-rollback",
          userId: USER_ID,
          url: "https://example.com/rollback",
          pageTitle: "Rollback",
          scannedAt,
        });
        throw new Error("violation insert failed");
      }),
    ).rejects.toThrow("violation insert failed");

    const runs = await db.select().from(audit).where(eq(audit.id, "a-rollback"));
    expect(runs).toHaveLength(0);
  });
});

describe("POST /api/ingest rate limiting", () => {
  // A distinct user/key from the tests above: the limiter is module state
  // shared across the file, so reusing USER_ID would carry over its request
  // count and make this test's 61st request 429 for the wrong reason.
  const RATE_LIMIT_KEY = "mend_test_key_rate_limit";
  const RATE_LIMIT_USER_ID = "u-ingest-rate-limit";

  beforeAll(async () => {
    await db.insert(user).values({
      id: RATE_LIMIT_USER_ID,
      name: "Rate Limit Test",
      email: "rate-limit@example.com",
    });
    await db.insert(apiKey).values({
      id: "k-ingest-rate-limit",
      userId: RATE_LIMIT_USER_ID,
      hashedKey: await hashKey(RATE_LIMIT_KEY),
      name: "Rate limit test key",
    });
  });

  it("allows 60 requests per minute and denies the 61st with 429 + Retry-After", async () => {
    const body = payload({ url: "https://example.com/rate-limit" });

    for (let i = 0; i < 60; i++) {
      const res = await post({ request: request(body, RATE_LIMIT_KEY) });
      expect(res.status).toBeLessThan(429);
    }

    const res = await post({ request: request(body, RATE_LIMIT_KEY) });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const responseBody = (await res.json()) as { error: string };
    expect(typeof responseBody.error).toBe("string");
    expect(responseBody.error.length).toBeGreaterThan(0);
  });
});
