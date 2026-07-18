/* ============================================================
   Server-only export builder: the JSON bundle behind GET
   /api/export. Never import this from client-reachable code.
   ============================================================ */

import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKey, audit, user, violation } from "@/db/schema";
import type { Impact, ViolationNode } from "@/lib/dashboard-data";

export interface ExportApiKey {
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ExportViolation {
  ruleId: string;
  impact: Impact;
  help: string;
  helpUrl: string | null;
  description: string;
  tags: string[];
  nodes: ViolationNode[];
}

export interface ExportAudit {
  url: string;
  pageTitle: string;
  scannedAt: string;
  durationMs: number | null;
  totalChecks: number | null;
  partial: boolean;
  violations: ExportViolation[];
}

export interface ExportBundle {
  format: "mend-export/v1";
  exportedAt: string;
  user: { name: string; email: string; createdAt: string };
  apiKeys: ExportApiKey[];
  audits: ExportAudit[];
}

/**
 * Everything Mend has stored for one account, shaped for download. Every
 * query below is scoped to `userId` — that single-column equality is the
 * entire security boundary, same idiom as `deleteAllAudits` in
 * account-fns.ts. Never widen it.
 */
export async function buildExport(userId: string): Promise<ExportBundle> {
  const [userRow] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!userRow) {
    throw new Error(`buildExport: no user row for id ${userId}`);
  }

  const keyRows = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
    .orderBy(asc(apiKey.createdAt));

  const auditRows = await db
    .select()
    .from(audit)
    .where(eq(audit.userId, userId))
    .orderBy(asc(audit.scannedAt));

  const violationRows = await db
    .select({
      auditId: violation.auditId,
      ruleId: violation.ruleId,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      description: violation.description,
      tags: violation.tags,
      nodes: violation.nodes,
    })
    .from(violation)
    .innerJoin(audit, eq(violation.auditId, audit.id))
    .where(eq(audit.userId, userId));

  const violationsByAudit = new Map<string, ExportViolation[]>();
  for (const v of violationRows) {
    const list = violationsByAudit.get(v.auditId) ?? [];
    list.push({
      ruleId: v.ruleId,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      description: v.description,
      tags: v.tags,
      nodes: v.nodes,
    });
    violationsByAudit.set(v.auditId, list);
  }

  return {
    format: "mend-export/v1",
    exportedAt: new Date().toISOString(),
    user: {
      name: userRow.name,
      email: userRow.email,
      createdAt: userRow.createdAt.toISOString(),
    },
    apiKeys: keyRows.map((k) => ({
      name: k.name,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
    })),
    audits: auditRows.map((a) => ({
      url: a.url,
      pageTitle: a.pageTitle,
      scannedAt: a.scannedAt.toISOString(),
      durationMs: a.durationMs,
      totalChecks: a.totalChecks,
      partial: a.partial,
      violations: violationsByAudit.get(a.id) ?? [],
    })),
  };
}
