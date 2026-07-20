import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

  it("rejects on an oversized Content-Length header before buffering the body", async () => {
    // Forged header well over 3× the UTF-16 cap, but a tiny body: the gate must
    // trip on the header alone, never reading the body.
    const req = new Request("http://localhost/api/ingest", {
      method: "POST",
      headers: {
        authorization: `Bearer ${KEY}`,
        "content-type": "application/json",
        "content-length": "3000001",
      },
      body: "{}",
    });
    // Guard: if undici ever stops preserving a forged content-length, this
    // assertion fails loudly rather than the test passing for the wrong reason.
    expect(req.headers.get("content-length")).toBe("3000001");

    const res = await post({ request: req });

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

  // FREE_LIMITS_ENFORCED does not change the free rate ceiling (legacy free and
  // enforced free are both 60/min), so these run at the default.
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

  // The touch of lastUsedAt now sits *after* the limiter, so a rate-limited
  // request must not cost a write. A fresh user/key so this test owns its full
  // 60-request budget.
  it("does not touch lastUsedAt when the request is rate-limited", async () => {
    const ORDER_KEY = "mend_test_key_order";
    const ORDER_USER_ID = "u-ingest-order";
    await db.insert(user).values({
      id: ORDER_USER_ID,
      name: "Order Test",
      email: "order@example.com",
    });
    await db.insert(apiKey).values({
      id: "k-ingest-order",
      userId: ORDER_USER_ID,
      hashedKey: await hashKey(ORDER_KEY),
      name: "Order test key",
    });

    // 60 allowed requests, each with a distinct startedAt so none collide on
    // the idempotency index.
    const base = Date.parse("2026-08-01T00:00:00.000Z");
    for (let i = 0; i < 60; i++) {
      const body = payload({ url: "https://example.com/order", startedAt: base + i * 1000 });
      const res = await post({ request: request(body, ORDER_KEY) });
      expect(res.status).toBeLessThan(429);
    }

    const afterAllowed = await db.select().from(apiKey).where(eq(apiKey.id, "k-ingest-order"));
    const touched = afterAllowed[0]!.lastUsedAt;
    expect(touched).not.toBeNull();

    // Request 61 trips the limiter; it must return before the touch runs.
    const limited = await post({
      request: request(
        payload({ url: "https://example.com/order", startedAt: base + 60_000 }),
        ORDER_KEY,
      ),
    });
    expect(limited.status).toBe(429);

    const afterLimited = await db.select().from(apiKey).where(eq(apiKey.id, "k-ingest-order"));
    expect(afterLimited[0]!.lastUsedAt).toEqual(touched);
  });

  // Pro rides a separate limiter instance, so its budget is independent of the
  // free one above as well as larger.
  it("allows a pro subscriber 300 requests per minute and denies the 301st", async () => {
    const PRO_KEY = "mend_test_key_pro_rate";
    const PRO_USER_ID = "u-ingest-pro-rate";
    await db.insert(user).values({
      id: PRO_USER_ID,
      name: "Pro Rate Test",
      email: "pro-rate@example.com",
    });
    await db.insert(apiKey).values({
      id: "k-ingest-pro-rate",
      userId: PRO_USER_ID,
      hashedKey: await hashKey(PRO_KEY),
      name: "Pro rate test key",
    });
    const { seedProSubscription } = await import("@/lib/billing-queries");
    await seedProSubscription(PRO_USER_ID);

    // One body throughout: the first request stores the run and the remaining
    // 299 come back as idempotent 200s. Both count against the limiter, which
    // is what this measures — a free user would have 429'd at request 61.
    const body = payload({ url: "https://example.com/pro-rate" });
    for (let i = 0; i < 300; i++) {
      const res = await post({ request: request(body, PRO_KEY) });
      expect(res.status).toBeLessThan(429);
    }

    const res = await post({ request: request(body, PRO_KEY) });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});

// The cap gates only rows that would be new. Duplicates are checked first and
// stay 200 even at the cap, so the extension's retries never turn into 403s.
describe("POST /api/ingest audit cap", () => {
  const CAP_BASE = Date.parse("2026-06-01T00:00:00.000Z");

  /** `count` stored runs for `userId`, at CAP_BASE + i seconds. */
  async function seedAudits(userId: string, count: number) {
    await db.insert(audit).values(
      Array.from({ length: count }, (_, i) => ({
        id: `a-${userId}-${i}`,
        userId,
        url: `https://example.com/cap-${i}`,
        pageTitle: `Cap ${i}`,
        scannedAt: new Date(CAP_BASE + i * 1000),
      })),
    );
  }

  /** A user at exactly the Free cap, with their own key so the shared
      rate-limiter state can't leak between cases. */
  async function seedUserAtCap(suffix: string, auditCount: number) {
    const userId = `u-cap-${suffix}`;
    const token = `mend_test_key_cap_${suffix}`;
    await db.insert(user).values({
      id: userId,
      name: `Cap ${suffix}`,
      email: `cap-${suffix}@example.com`,
    });
    await db.insert(apiKey).values({
      id: `k-cap-${suffix}`,
      userId,
      hashedKey: await hashKey(token),
      name: `Cap ${suffix} key`,
    });
    await seedAudits(userId, auditCount);
    return { userId, token };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a new run with 403 AUDIT_CAP once a free user is at 200", async () => {
    vi.stubEnv("FREE_LIMITS_ENFORCED", "true");
    const { token } = await seedUserAtCap("full", 200);

    const res = await post({
      request: request(
        payload({ url: "https://example.com/over-the-cap", startedAt: CAP_BASE + 999_000 }),
        token,
      ),
    });

    expect(res.status).toBe(403);
    // CORS must survive the new status, or the extension shows an opaque
    // network error instead of the message below.
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("AUDIT_CAP");
    expect(body.error).toContain("200");
    expect(body.error).toMatch(/upgrade to Pro/i);
  });

  it("still returns 200 duplicate for an already-stored run at the cap", async () => {
    vi.stubEnv("FREE_LIMITS_ENFORCED", "true");
    const { token } = await seedUserAtCap("dupe", 200);

    // Exactly the (url, startedAt) of a seeded run.
    const res = await post({
      request: request(
        payload({ url: "https://example.com/cap-7", startedAt: CAP_BASE + 7000 }),
        token,
      ),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ duplicate: true });
  });

  it("does not cap an unenforced free user holding more than 200 audits", async () => {
    const { userId, token } = await seedUserAtCap("legacy", 250);

    const res = await post({
      request: request(
        payload({ url: "https://example.com/legacy-new", startedAt: CAP_BASE + 999_000 }),
        token,
      ),
    });

    expect(res.status).toBe(201);
    const stored = await db.select().from(audit).where(eq(audit.userId, userId));
    expect(stored).toHaveLength(251);
  });

  it("lets a pro subscriber past the free cap", async () => {
    vi.stubEnv("FREE_LIMITS_ENFORCED", "true");
    const { userId, token } = await seedUserAtCap("pro", 200);
    const { seedProSubscription } = await import("@/lib/billing-queries");
    await seedProSubscription(userId);

    const res = await post({
      request: request(
        payload({ url: "https://example.com/pro-new", startedAt: CAP_BASE + 999_000 }),
        token,
      ),
    });

    expect(res.status).toBe(201);
  });
});
