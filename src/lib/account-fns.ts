/* ============================================================
   Server functions for the account page: API-key management for
   the Mend extension. Session-guarded; the key plaintext is
   returned exactly once, on creation.
   ============================================================ */

import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { and, desc, eq } from "drizzle-orm";
import { currentSessionUser } from "@/lib/session";
import { db } from "@/db";
import { apiKey } from "@/db/schema";
import { generateKey, hashKey } from "@/lib/api-key";

// Key metadata safe to send to the client — never the hash or the key itself.
export interface ApiKeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

async function listKeysFor(userId: string): Promise<ApiKeyRow[]> {
  const rows = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(desc(apiKey.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
  }));
}

// A leaked key is the blast radius here, and nobody legitimately runs 20
// extensions. Counts active keys only, so revoking frees a slot. Exported so
// the quota is testable without invoking the createServerFn wrapper.
export const MAX_ACTIVE_KEYS = 20;

export async function assertKeyQuota(userId: string): Promise<void> {
  const active = (await listKeysFor(userId)).filter((k) => !k.revokedAt);
  if (active.length >= MAX_ACTIVE_KEYS) {
    throw new Error("Key limit reached. Revoke an unused key first.");
  }
}

export const fetchAccount = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await currentSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return { user, keys: await listKeysFor(user.id) };
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
