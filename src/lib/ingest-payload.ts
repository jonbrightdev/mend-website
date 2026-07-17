/* ============================================================
   Pure parsing for the extension's ingest payload: validation
   and rule grouping, with no database access — so the route in
   src/routes/api/ingest.ts and its tests can share it. The
   route owns auth, CORS and persistence.
   ============================================================ */

import type { Impact, ViolationNode } from "@/lib/dashboard-data";

const IMPACTS = new Set<string>(["critical", "serious", "moderate", "minor"]);

// Caps for a payload from an untrusted client. Identifiers reject, because a
// truncated one silently points at the wrong thing; display content truncates,
// because a real page can hold a legitimately huge element and losing the tail
// of a snippet beats dropping the audit. Every cap is ~10x what the extension
// actually sends (it already clips html to 500 chars).
const LIMITS = {
  url: 2_000,
  pageTitle: 500,
  issues: 1_000,
  ruleId: 200,
  category: 200,
  title: 500,
  description: 2_000,
  helpUrl: 2_000,
  selector: 2_000,
  html: 5_000,
  failureSummary: 5_000,
  wcagEntries: 25,
  wcagLength: 200,
} as const;

// Reject timestamps that would corrupt the dashboard's "last scanned" ordering
// and trend maths.
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const MIN_STARTED_AT = Date.UTC(2020, 0, 1);

export interface IngestIssue {
  ruleId: string;
  impact: Impact;
  category: string;
  wcag: string[];
  title: string;
  description: string;
  helpUrl?: string;
  selector: string;
  html: string;
  failureSummary?: string;
  domOrder: number;
}

export interface IngestPayload {
  url: string;
  pageTitle: string;
  scannedAt: Date;
  durationMs?: number;
  totalChecks?: number;
  partial: boolean;
  issues: IngestIssue[];
}

function bad(message: string): never {
  throw new IngestError(message);
}

export class IngestError extends Error {}

function str(v: unknown, field: string, opts?: { optional?: boolean }): string {
  if (v == null && opts?.optional) return "";
  if (typeof v !== "string") bad(`${field} must be a string`);
  return v;
}

function clip(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v;
}

// Keeps a client-supplied number inside a sane range, else falls back. The
// upper bounds also hold durationMs/totalChecks inside Postgres int4, which
// would otherwise throw on insert.
function num<T extends number | undefined>(v: unknown, max: number, fallback: T): number | T {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  const rounded = Math.round(v);
  return rounded >= 0 && rounded <= max ? rounded : fallback;
}

export function parsePayload(body: unknown): IngestPayload {
  if (typeof body !== "object" || body === null) bad("body must be an object");
  const b = body as Record<string, unknown>;

  const url = str(b.url, "url");
  if (!/^https?:\/\//.test(url)) bad("url must be an http(s) URL");
  if (url.length > LIMITS.url) bad("url is too long");

  if (typeof b.startedAt !== "number" || !Number.isFinite(b.startedAt)) {
    bad("startedAt must be an epoch-ms number");
  }
  const scannedAt = new Date(b.startedAt);
  if (Number.isNaN(scannedAt.getTime())) bad("startedAt is not a valid time");
  if (b.startedAt > Date.now() + MAX_FUTURE_MS) bad("startedAt is in the future");
  if (b.startedAt < MIN_STARTED_AT) bad("startedAt is unreasonably old");

  if (!Array.isArray(b.issues)) bad("issues must be an array");
  if (b.issues.length > LIMITS.issues) bad(`too many issues (max ${LIMITS.issues})`);
  const issues = b.issues.map((raw, i): IngestIssue => {
    if (typeof raw !== "object" || raw === null) bad(`issues[${i}] must be an object`);
    const it = raw as Record<string, unknown>;
    const impact = str(it.impact, `issues[${i}].impact`);
    if (!IMPACTS.has(impact)) bad(`issues[${i}].impact must be one of critical|serious|moderate|minor`);
    const ruleId = str(it.ruleId, `issues[${i}].ruleId`) || bad(`issues[${i}].ruleId is empty`);
    if (ruleId.length > LIMITS.ruleId) bad(`issues[${i}].ruleId is too long`);
    const helpUrl = typeof it.helpUrl === "string" ? it.helpUrl : undefined;
    return {
      ruleId,
      impact: impact as Impact,
      category: clip(str(it.category, `issues[${i}].category`, { optional: true }), LIMITS.category),
      wcag: Array.isArray(it.wcag)
        ? it.wcag
            .filter((w): w is string => typeof w === "string" && w.length <= LIMITS.wcagLength)
            .slice(0, LIMITS.wcagEntries)
        : [],
      title: clip(str(it.title, `issues[${i}].title`), LIMITS.title),
      description: clip(
        str(it.description, `issues[${i}].description`, { optional: true }),
        LIMITS.description,
      ),
      helpUrl: helpUrl && helpUrl.length <= LIMITS.helpUrl ? helpUrl : undefined,
      selector: clip(str(it.selector, `issues[${i}].selector`), LIMITS.selector),
      html: clip(str(it.html, `issues[${i}].html`, { optional: true }), LIMITS.html),
      failureSummary:
        typeof it.failureSummary === "string"
          ? clip(it.failureSummary, LIMITS.failureSummary)
          : undefined,
      domOrder: num(it.domOrder, 1e6, i),
    };
  });

  return {
    url,
    pageTitle: clip(str(b.pageTitle, "pageTitle", { optional: true }) || url, LIMITS.pageTitle),
    scannedAt,
    durationMs: num(b.durationMs, 1e9, undefined),
    totalChecks: num(b.totalChecks, 1e9, undefined),
    partial: b.partial === true,
    issues,
  };
}

export function groupViolations(auditId: string, issues: IngestIssue[]) {
  const byRule = new Map<string, IngestIssue[]>();
  for (const issue of issues) {
    const list = byRule.get(issue.ruleId) ?? [];
    list.push(issue);
    byRule.set(issue.ruleId, list);
  }
  return [...byRule.entries()].map(([ruleId, group]) => {
    const first = group[0]!;
    const nodes: ViolationNode[] = [...group]
      .sort((a, b) => a.domOrder - b.domOrder)
      .map((issue) => ({
        target: issue.selector,
        html: issue.html,
        failureSummary: issue.failureSummary ?? "",
      }));
    const tags = [
      ...(first.category ? [first.category] : []),
      ...new Set(group.flatMap((issue) => issue.wcag)),
    ];
    return {
      id: crypto.randomUUID(),
      auditId,
      ruleId,
      impact: first.impact,
      help: first.title,
      helpUrl: first.helpUrl ?? null,
      description: first.description,
      tags,
      nodes,
    };
  });
}
