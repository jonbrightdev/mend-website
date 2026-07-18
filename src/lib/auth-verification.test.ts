import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { user } from "@/db/schema";

// The auth config wires sendOnSignUp so every email+password signup gets a
// verification email through the shared mailer seam. @/lib/auth pulls in
// @/db, so it (and the mailer it wraps) must be imported dynamically in
// beforeAll, after createTestDb() has put the in-memory instance on
// globalThis for "@/db" to pick up.

vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

let db: Awaited<ReturnType<typeof createTestDb>>;
let auth: (typeof import("@/lib/auth"))["auth"];
let sendMail: (typeof import("@/lib/mailer"))["sendMail"];

describe("email verification on signup", () => {
  beforeAll(async () => {
    db = await createTestDb();
    ({ auth } = await import("@/lib/auth"));
    ({ sendMail } = await import("@/lib/mailer"));
  });

  it("sends a verification email with a link on signup", async () => {
    await auth.api.signUpEmail({
      body: { name: "Ada", email: "ada@example.com", password: "correct-horse-battery" },
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        subject: expect.stringContaining("Verify"),
        // No BETTER_AUTH_URL is set in tests, so Better Auth emits a relative
        // link; the path is what proves the callback wiring, not the scheme.
        text: expect.stringContaining("/verify-email"),
      }),
    );
  });

  it("leaves the new user unverified until the link is visited", async () => {
    await auth.api.signUpEmail({
      body: { name: "Bea", email: "bea@example.com", password: "correct-horse-battery" },
    });

    const rows = await db.select().from(user).where(eq(user.email, "bea@example.com"));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.emailVerified).toBe(false);
  });
});
