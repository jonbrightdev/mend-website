import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Impact, ViolationNode } from "@/lib/dashboard-data";

// Better Auth core schema (email+password, sessions, OAuth accounts, and
// verification tokens for magic links / email verification). Column names match
// Better Auth's model fields so the Drizzle adapter maps them without overrides.
// Application tables (audit, violation) hold ingested extension runs.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  // Stripe customer id — kept off the session cookie payload (not an
  // additionalField); billing PII stays out of src/lib/session.ts.
  stripeCustomerId: text("stripeCustomerId").unique(),
  // Internal auditors (manual-audit product) — set by hand in the DB, never
  // through the app. App-managed column like stripeCustomerId; Better Auth
  // doesn't know about it.
  isAuditor: boolean("isAuditor").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

// One row per audit run. A page's history is every run with the same
// (userId, url); the dashboard shows the latest run per URL and computes the
// trend from the older ones. The unique index makes ingest idempotent — the
// extension can safely re-send a run.
export const audit = pgTable(
  "audit",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    pageTitle: text("pageTitle").notNull(),
    scannedAt: timestamp("scannedAt").notNull(),
    durationMs: integer("durationMs"),
    totalChecks: integer("totalChecks"),
    partial: boolean("partial").notNull().default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("audit_user_url_scanned").on(t.userId, t.url, t.scannedAt)],
);

// Long-lived keys the Mend extension uses to authenticate to /api/ingest
// (see src/lib/api-key.ts). Only the SHA-256 hash is stored; the plaintext is
// shown once at creation. A key is active while revokedAt is null. The unique
// index on hashedKey is the lookup path on every ingest request.
export const apiKey = pgTable("apiKey", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  hashedKey: text("hashedKey").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  lastUsedAt: timestamp("lastUsedAt"),
  revokedAt: timestamp("revokedAt"),
});

// Issues grouped by rule within a run, mirroring the portal's Violation shape.
// nodes holds the affected elements ({ target, html, failureSummary }); tags
// holds the extension's category plus WCAG criteria numbers.
export const violation = pgTable(
  "violation",
  {
    id: text("id").primaryKey(),
    auditId: text("auditId")
      .notNull()
      .references(() => audit.id, { onDelete: "cascade" }),
    ruleId: text("ruleId").notNull(),
    impact: text("impact").$type<Impact>().notNull(),
    help: text("help").notNull(),
    helpUrl: text("helpUrl"),
    description: text("description").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    nodes: jsonb("nodes").$type<ViolationNode[]>().notNull(),
  },
  // Every dashboard/detail query filters violations by auditId, and the cascade
  // delete from audit resolves through it; Postgres doesn't index FK columns
  // automatically.
  (t) => [index("violation_audit_idx").on(t.auditId)],
);

// Mirror of the user's Stripe subscription. Free users have NO row — never a
// synthetic none-status placeholder. `plan` is the product purchased from the price id
// ("free" / "pro"), NOT the current entitlement; entitlement is always derived
// via effectivePlan() in src/lib/entitlements.ts. One personal mirror per user.
export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(), // our UUID, stable across resubscribes
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripeSubscriptionId").notNull().unique(),
    stripePriceId: text("stripePriceId").notNull(),
    plan: text("plan").$type<"free" | "pro">().notNull(),
    status: text("status")
      .$type<
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "unpaid"
        | "incomplete"
        | "incomplete_expired"
        | "paused"
      >()
      .notNull(),
    currentPeriodStart: timestamp("currentPeriodStart"),
    currentPeriodEnd: timestamp("currentPeriodEnd"),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
    canceledAt: timestamp("canceledAt"),
    interval: text("interval").$type<"month" | "year" | null>(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscription_user_uidx").on(t.userId),
    // stripeSubscriptionId already .unique() — no second index
  ],
);

// A URL the user asked us to track. The scheduler (plan 045) runs every
// monitor whose nextRunAt has passed and pausedAt is null, stores the result
// as a normal audit row, then re-rolls nextRunAt to a random instant in the
// next UTC day (src/lib/monitor-schedule.ts). lastError is the last run's
// failure message, cleared on success.
export const monitor = pgTable(
  "monitor",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    pausedAt: timestamp("pausedAt"),
    nextRunAt: timestamp("nextRunAt").notNull(),
    lastRunAt: timestamp("lastRunAt"),
    lastError: text("lastError"),
  },
  (t) => [
    uniqueIndex("monitor_user_url").on(t.userId, t.url),
    // The scheduler's due-scan is a range query on nextRunAt.
    index("monitor_next_run_idx").on(t.nextRunAt),
  ],
);

/* ============================================================
   Manual audit (WCAG-EM) tables — the paid auditor product.

   Distinct from `audit` above, which is one *automated* scan run
   from the consumer extension. Here an internal auditor (a user
   with isAuditor) assembles a page sample, works the criterion
   checklist page by page, and logs findings via the mend-manual-
   helper extension. `userId` is the customer whose dashboard the
   published audit appears on; `auditorUserId` is who performs it.
   ============================================================ */

export type ManualAuditStatus = "in_progress" | "complete" | "published";
export type CheckStatus = "pass" | "fail" | "not_applicable" | "not_tested";
export type FindingProvenance = "manual" | "automated_confirmed";

export const manualAudit = pgTable(
  "manual_audit",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // No cascade: deleting an auditor account must not destroy customer audits.
    auditorUserId: text("auditorUserId")
      .notNull()
      .references(() => user.id),
    name: text("name").notNull(),
    scopeUrl: text("scopeUrl").notNull(),
    wcagVersion: text("wcagVersion").notNull().default("2.2"),
    conformanceTarget: text("conformanceTarget").$type<"A" | "AA">().notNull().default("AA"),
    status: text("status").$type<ManualAuditStatus>().notNull().default("in_progress"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    publishedAt: timestamp("publishedAt"),
  },
  (t) => [
    index("manual_audit_user_idx").on(t.userId),
    index("manual_audit_auditor_idx").on(t.auditorUserId),
  ],
);

// One sampled item (WCAG-EM step 3). A distinct *state* of a URL ("checkout
// with validation errors shown") is its own row, so stateDescription is part
// of the sample identity, not a note.
export const manualAuditPage = pgTable(
  "manual_audit_page",
  {
    id: text("id").primaryKey(),
    manualAuditId: text("manualAuditId")
      .notNull()
      .references(() => manualAudit.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    stateDescription: text("stateDescription"),
    sortOrder: integer("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("manual_audit_page_audit_idx").on(t.manualAuditId)],
);

// The coverage matrix, stored sparse: a row exists only once the auditor has
// set a status for (page, criterion). Absence means not_tested, so audit
// completeness = rows with status != not_tested / (pages × applicable criteria).
export const manualAuditCheck = pgTable(
  "manual_audit_check",
  {
    id: text("id").primaryKey(),
    manualAuditId: text("manualAuditId")
      .notNull()
      .references(() => manualAudit.id, { onDelete: "cascade" }),
    pageId: text("pageId")
      .notNull()
      .references(() => manualAuditPage.id, { onDelete: "cascade" }),
    sc: text("sc").notNull(), // dotted criterion number, e.g. "1.4.3"
    status: text("status").$type<CheckStatus>().notNull(),
    notes: text("notes"),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("manual_audit_check_page_sc").on(t.pageId, t.sc),
    index("manual_audit_check_audit_idx").on(t.manualAuditId),
  ],
);

// A logged violation, attached to page + criterion. provenance records whether
// the auditor found it by hand or confirmed an axe candidate — nothing
// automated reaches the customer unreviewed. screenshotKey names a file in the
// screenshot store (src/lib/manual-audit.ts), not a URL.
export const manualFinding = pgTable(
  "manual_finding",
  {
    id: text("id").primaryKey(),
    manualAuditId: text("manualAuditId")
      .notNull()
      .references(() => manualAudit.id, { onDelete: "cascade" }),
    pageId: text("pageId")
      .notNull()
      .references(() => manualAuditPage.id, { onDelete: "cascade" }),
    sc: text("sc").notNull(),
    severity: text("severity").$type<Impact>().notNull(),
    summary: text("summary").notNull(),
    description: text("description"),
    remediation: text("remediation"),
    selector: text("selector"),
    html: text("html"),
    screenshotKey: text("screenshotKey"),
    provenance: text("provenance").$type<FindingProvenance>().notNull(),
    axeRuleId: text("axeRuleId"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("manual_finding_audit_idx").on(t.manualAuditId),
    index("manual_finding_page_idx").on(t.pageId),
  ],
);

// A rejected axe candidate, with the auditor's reason — kept so the audit is
// defensible ("axe flagged this; here's why it isn't a violation").
export const manualDismissal = pgTable(
  "manual_dismissal",
  {
    id: text("id").primaryKey(),
    manualAuditId: text("manualAuditId")
      .notNull()
      .references(() => manualAudit.id, { onDelete: "cascade" }),
    pageId: text("pageId")
      .notNull()
      .references(() => manualAuditPage.id, { onDelete: "cascade" }),
    axeRuleId: text("axeRuleId").notNull(),
    selector: text("selector"),
    reason: text("reason").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (t) => [index("manual_dismissal_page_idx").on(t.pageId)],
);

// Processed Stripe webhook events, keyed by Stripe's event id for idempotency.
// The row is inserted in the same DB transaction as the applied change (wiring
// lands in plan 038); this unit only creates the table.
export const stripeEvent = pgTable("stripe_event", {
  id: text("id").primaryKey(), // evt_...
  type: text("type").notNull(),
  processedAt: timestamp("processedAt").notNull().defaultNow(),
});
