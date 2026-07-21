import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { hashKey } from "@/lib/api-key";
import { apiKey, manualAuditCheck, user } from "@/db/schema";

// Covers the /api/manual/* routes end-to-end against the in-memory DB:
// auditor-only auth, cross-auditor isolation, the finding→check coupling, the
// check upsert's notes semantics, and screenshot storage. Route modules pull
// in "@/db", so they're imported dynamically after createTestDb() (see
// ingest.test.ts for the pattern).

const AUDITOR_KEY = "mend_auditor_key";
const OTHER_AUDITOR_KEY = "mend_other_auditor_key";
const CIVILIAN_KEY = "mend_civilian_key";

type Handler = (ctx: {
  request: Request;
  params: Record<string, string>;
}) => Promise<Response>;
type RouteModule = {
  Route: { options: { server: { handlers: Record<string, Handler> } } };
};
// Asserted rather than indexed so noUncheckedIndexedAccess doesn't force a
// guard at every call site; the suite only calls methods the routes define.
type Methods = Record<"GET" | "POST" | "PUT" | "PATCH", Handler>;

let handlers: {
  audits: Methods;
  auditDetail: Methods;
  pages: Methods;
  checks: Methods;
  findings: Methods;
  dismissals: Methods;
  screenshots: Methods;
};
let db: Awaited<ReturnType<typeof createTestDb>>;

function request(
  method: string,
  body?: unknown,
  token: string = AUDITOR_KEY,
): Request {
  return new Request("http://localhost/api/manual", {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// A 1x1 transparent PNG — a real decodable image, not filler bytes.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("/api/manual/*", () => {
  beforeAll(async () => {
    process.env.SCREENSHOT_DIR = mkdtempSync(join(tmpdir(), "mend-screens-"));
    db = await createTestDb();

    await db.insert(user).values([
      { id: "u-auditor", name: "Aud", email: "aud@mend.test", isAuditor: true },
      { id: "u-other", name: "Other", email: "other@mend.test", isAuditor: true },
      { id: "u-civilian", name: "Civ", email: "civ@mend.test" },
      { id: "u-customer", name: "Cust", email: "customer@mend.test" },
    ]);
    await db.insert(apiKey).values([
      { id: "k-a", userId: "u-auditor", hashedKey: await hashKey(AUDITOR_KEY), name: "a" },
      { id: "k-o", userId: "u-other", hashedKey: await hashKey(OTHER_AUDITOR_KEY), name: "o" },
      { id: "k-c", userId: "u-civilian", hashedKey: await hashKey(CIVILIAN_KEY), name: "c" },
    ]);

    const pick = (m: RouteModule) => m.Route.options.server.handlers as Methods;
    handlers = {
      audits: pick((await import("@/routes/api/manual/audits")) as unknown as RouteModule),
      auditDetail: pick(
        (await import("@/routes/api/manual/audits.$auditId")) as unknown as RouteModule,
      ),
      pages: pick(
        (await import("@/routes/api/manual/audits.$auditId.pages")) as unknown as RouteModule,
      ),
      checks: pick((await import("@/routes/api/manual/checks")) as unknown as RouteModule),
      findings: pick((await import("@/routes/api/manual/findings")) as unknown as RouteModule),
      dismissals: pick(
        (await import("@/routes/api/manual/dismissals")) as unknown as RouteModule,
      ),
      screenshots: pick(
        (await import("@/routes/api/manual/screenshots.$key")) as unknown as RouteModule,
      ),
    };
  });

  async function createAudit(): Promise<string> {
    const res = await handlers.audits.POST({
      request: request("POST", {
        customerEmail: "customer@mend.test",
        name: "Test audit",
        scopeUrl: "https://customer.test",
        conformanceTarget: "AA",
      }),
      params: {},
    });
    expect(res.status).toBe(201);
    const { audit } = (await res.json()) as { audit: { id: string; userId: string } };
    expect(audit.userId).toBe("u-customer");
    return audit.id;
  }

  async function addPage(auditId: string): Promise<string> {
    const res = await handlers.pages.POST({
      request: request("POST", { url: "https://customer.test/checkout", title: "Checkout" }),
      params: { auditId },
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { page: { id: string } }).page.id;
  }

  it("rejects non-auditors and revoked keys on every route", async () => {
    for (const [h, method] of [
      [handlers.audits.GET, "GET"],
      [handlers.audits.POST, "POST"],
      [handlers.checks.PUT, "PUT"],
      [handlers.findings.POST, "POST"],
      [handlers.dismissals.POST, "POST"],
    ] as const) {
      const res = await h({
        request: request(method, method === "GET" ? undefined : {}, CIVILIAN_KEY),
        params: {},
      });
      expect(res.status).toBe(401);
    }

    await db.update(apiKey).set({ revokedAt: new Date() }).where(eq(apiKey.id, "k-c"));
    const res = await handlers.audits.GET({
      request: request("GET", undefined, CIVILIAN_KEY),
      params: {},
    });
    expect(res.status).toBe(401);
  });

  it("hides one auditor's audit from another", async () => {
    const auditId = await createAudit();
    const res = await handlers.auditDetail.GET({
      request: request("GET", undefined, OTHER_AUDITOR_KEY),
      params: { auditId },
    });
    expect(res.status).toBe(404);
  });

  it("creating a finding flips the (page, criterion) check to fail", async () => {
    const auditId = await createAudit();
    const pageId = await addPage(auditId);

    const res = await handlers.findings.POST({
      request: request("POST", {
        auditId,
        pageId,
        sc: "1.4.3",
        severity: "serious",
        summary: "CTA fails contrast",
        provenance: "automated_confirmed",
        axeRuleId: "color-contrast",
      }),
      params: {},
    });
    expect(res.status).toBe(201);

    const [check] = await db
      .select()
      .from(manualAuditCheck)
      .where(and(eq(manualAuditCheck.pageId, pageId), eq(manualAuditCheck.sc, "1.4.3")));
    expect(check).toMatchObject({ status: "fail" });
  });

  it("keeps notes through a bare status tick, and replaces them when sent", async () => {
    const auditId = await createAudit();
    const pageId = await addPage(auditId);
    const put = (body: Record<string, unknown>) =>
      handlers.checks.PUT({
        request: request("PUT", { auditId, pageId, sc: "2.4.7", ...body }),
        params: {},
      });

    expect((await put({ status: "fail", notes: "focus ring invisible on cards" })).status).toBe(
      200,
    );
    expect((await put({ status: "pass" })).status).toBe(200); // bare tick

    const [check] = await db
      .select()
      .from(manualAuditCheck)
      .where(and(eq(manualAuditCheck.pageId, pageId), eq(manualAuditCheck.sc, "2.4.7")));
    expect(check).toMatchObject({ status: "pass", notes: "focus ring invisible on cards" });
  });

  it("rejects unknown criteria", async () => {
    const auditId = await createAudit();
    const pageId = await addPage(auditId);
    const res = await handlers.checks.PUT({
      request: request("PUT", { auditId, pageId, sc: "4.1.1", status: "pass" }),
      params: {},
    });
    expect(res.status).toBe(400); // 4.1.1 is obsolete in WCAG 2.2
  });

  it("stores a screenshot and serves it back; oversize is rejected", async () => {
    const auditId = await createAudit();
    const pageId = await addPage(auditId);

    const created = await handlers.findings.POST({
      request: request("POST", {
        auditId,
        pageId,
        sc: "1.1.1",
        severity: "critical",
        summary: "Hero image has no alt",
        provenance: "manual",
        screenshotBase64: TINY_PNG,
      }),
      params: {},
    });
    expect(created.status).toBe(201);
    const { finding } = (await created.json()) as { finding: { screenshotKey: string } };
    expect(finding.screenshotKey).toMatch(/\.png$/);

    const img = await handlers.screenshots.GET({
      request: request("GET"),
      params: { key: finding.screenshotKey },
    });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");

    const big = await handlers.findings.POST({
      request: request("POST", {
        auditId,
        pageId,
        sc: "1.1.1",
        severity: "critical",
        summary: "too big",
        provenance: "manual",
        screenshotBase64: "A".repeat(6_000_001),
      }),
      params: {},
    });
    expect(big.status).toBe(413);
  });

  it("requires a reason to dismiss a candidate", async () => {
    const auditId = await createAudit();
    const pageId = await addPage(auditId);
    const dismiss = (reason?: string) =>
      handlers.dismissals.POST({
        request: request("POST", { auditId, pageId, axeRuleId: "region", reason }),
        params: {},
      });

    expect((await dismiss()).status).toBe(400);
    expect((await dismiss("Decorative sidebar; landmark not required")).status).toBe(201);
  });
});
