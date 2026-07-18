import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";

// Covers the auth guard on GET /api/export. The signed-cookie session path
// can't be forged cheaply in a unit test; it is covered by export-data.test.ts
// (which exercises buildExport directly) plus the plan's manual end-to-end
// check over a real session cookie.

type Handler = (ctx: { request: Request }) => Promise<Response>;

let get: Handler;

describe("GET /api/export", () => {
  beforeAll(async () => {
    await createTestDb();

    const mod = await import("@/routes/api/export");
    get = (mod.Route as unknown as {
      options: { server: { handlers: { GET: Handler } } };
    }).options.server.handlers.GET;
  });

  it("rejects a request with no session cookie as 401", async () => {
    const res = await get({ request: new Request("http://localhost/api/export") });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
