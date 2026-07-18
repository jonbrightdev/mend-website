/* ============================================================
   DB queries for the account page, kept out of account-fns.ts on
   purpose: "@/db" is server-only, and a non-handler export that
   reaches it drags the db driver into the client bundle (the
   import-protection build error). account-fns.ts only calls these
   inside createServerFn handlers, which the client build strips.
   Mirrors the dashboard-fns / dashboard-queries split.
   ============================================================ */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { account, apiKey } from "@/db/schema";

// Key metadata safe to send to the client — never the hash or the key itself.
export interface ApiKeyRow {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function listKeysFor(userId: string): Promise<ApiKeyRow[]> {
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

// Whether the user can re-verify with a password. OAuth-only accounts have no
// "credential" row, so the delete-account UI must not demand a password from
// them. Exported so it is testable without invoking the createServerFn wrapper.
export async function userHasPassword(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return rows.length > 0;
}
