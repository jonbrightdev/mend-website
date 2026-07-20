/* ============================================================
   Server functions for the account page: API-key management for
   the Mend extension. Session-guarded; the key plaintext is
   returned exactly once, on creation.

   Everything that touches "@/db" outside a handler body lives in
   account-queries.ts — a plain export here that reaches the db
   survives into the client bundle and fails the build's
   server-only import protection.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { currentSessionUser } from "@/lib/session";
import { db } from "@/db";
import { apiKey, audit } from "@/db/schema";
import { generateKey, hashKey } from "@/lib/api-key";
import {
  assertKeyQuota,
  getKeyQuota,
  listKeysFor,
  userHasPassword,
} from "@/lib/account-queries";
import { getBillingSummary } from "@/lib/billing-queries";

export type { ApiKeyRow, KeyQuota } from "@/lib/account-queries";
export type { BillingSummary } from "@/lib/billing-queries";

export const fetchAccount = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return {
      user,
      keys: await listKeysFor(user.id),
      hasPassword: await userHasPassword(user.id),
      keyQuota: await getKeyQuota(user.id),
      billing: await getBillingSummary(user.id),
    };
  },
);

export const createApiKey = createServerFn({ method: "POST" })
  .validator((name: unknown): string => {
    const trimmed = typeof name === "string" ? name.trim() : "";
    return (trimmed || "Chrome extension").slice(0, 80);
  })
  .handler(async ({ data: name }) => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await assertKeyQuota(user.id);
    const key = generateKey();
    await db.insert(apiKey).values({
      id: crypto.randomUUID(),
      userId: user.id,
      hashedKey: await hashKey(key),
      name,
    });
    // `key` is the only time the plaintext exists outside the user's machine.
    return { key, keys: await listKeysFor(user.id) };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .validator((id: unknown): string => {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("id is required");
    }
    return id;
  })
  .handler(async ({ data: id }) => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    // Scope to the owner so a key id can't be revoked by another account.
    await db
      .update(apiKey)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKey.id, id), eq(apiKey.userId, user.id)));
    return { keys: await listKeysFor(user.id) };
  });

// Deletes every synced audit (and, via the auditId cascade, its violation rows)
// for the current user. The owner-scoped where clause is the entire security
// boundary — it must never widen.
export const deleteAllAudits = createServerFn({ method: "POST" }).handler(
  async () => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await db.delete(audit).where(eq(audit.userId, user.id));
    return { ok: true };
  },
);
