import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

// Covers the auth guard on GET /api/vpat. The signed-cookie session path can't
// be forged cheaply in a unit test; the report itself is covered by
// vpat-data.test.ts and vpat-render.test.ts, which exercise the builder and the
// renderer directly. Same shape as export.test.ts.

type Handler = (ctx: { request: Request }) => Promise<Response>;

let get: Handler;

describe("GET /api/vpat", () => {
  beforeAll(async () => {
    await createTestDb();

    const mod = await import("@/routes/api/vpat");
    get = (mod.Route as unknown as {
      options: { server: { handlers: { GET: Handler } } };
    }).options.server.handlers.GET;
  });

  it("rejects a request with no session cookie as 401", async () => {
    const res = await get({ request: new Request("http://localhost/api/vpat") });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects an unauthenticated request even with a name query", async () => {
    const res = await get({
      request: new Request("http://localhost/api/vpat?name=Acme"),
    });

    expect(res.status).toBe(401);
  });
});
