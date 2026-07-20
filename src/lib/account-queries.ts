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
import { getUserEntitlements } from "@/lib/billing-queries";
import { PLAN_LIMITS } from "@/lib/entitlements";

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

// The Pro ceiling, which is also what legacy free gets while
// FREE_LIMITS_ENFORCED is unset. Kept as a named export because tests and
// callers read it, but it is *not* the authority — entitlements are, and this
// re-exports their Pro number so the two can't drift apart.
export const MAX_ACTIVE_KEYS = PLAN_LIMITS.pro.maxActiveApiKeys;

// A leaked key is the blast radius here, and nobody legitimately runs 20
// extensions. Counts active keys only, so revoking frees a slot. Exported so
// the quota is testable without invoking the createServerFn wrapper.
//
// Gates *new* keys only. A Free user who already holds more than the Free
// limit — from before enforcement, or from a lapsed Pro subscription — keeps
// every key they have; nothing here revokes. They simply can't add another
// until they revoke down under the limit.
export async function assertKeyQuota(userId: string): Promise<void> {
  const { maxActiveApiKeys } = await getUserEntitlements(userId);
  const active = (await listKeysFor(userId)).filter((k) => !k.revokedAt);
  if (active.length >= maxActiveApiKeys) {
    throw new Error(
      maxActiveApiKeys <= PLAN_LIMITS.free.maxActiveApiKeys
        ? `Free accounts can have ${maxActiveApiKeys} active keys. Revoke one or upgrade to Pro.`
        : "Key limit reached. Revoke an unused key first.",
    );
  }
}

// What the key panel shows above Generate: how many active keys exist and how
// many the plan allows. Reads the same entitlements assertKeyQuota enforces, so
// the disabled button and the server error can never disagree. `max` is null
// only if a plan ever grows an unbounded key allowance — JSON can't carry
// Infinity, and the UI hides the cap rather than printing "null".
export interface KeyQuota {
  active: number;
  max: number | null;
}

export async function getKeyQuota(userId: string): Promise<KeyQuota> {
  const { maxActiveApiKeys } = await getUserEntitlements(userId);
  const active = (await listKeysFor(userId)).filter((k) => !k.revokedAt).length;
  return {
    active,
    max: Number.isFinite(maxActiveApiKeys) ? maxActiveApiKeys : null,
  };
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
