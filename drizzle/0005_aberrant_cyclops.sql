CREATE TABLE "manual_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"auditorUserId" text NOT NULL,
	"name" text NOT NULL,
	"scopeUrl" text NOT NULL,
	"wcagVersion" text DEFAULT '2.2' NOT NULL,
	"conformanceTarget" text DEFAULT 'AA' NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"publishedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "manual_audit_check" (
	"id" text PRIMARY KEY NOT NULL,
	"manualAuditId" text NOT NULL,
	"pageId" text NOT NULL,
	"sc" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_audit_page" (
	"id" text PRIMARY KEY NOT NULL,
	"manualAuditId" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"stateDescription" text,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_dismissal" (
	"id" text PRIMARY KEY NOT NULL,
	"manualAuditId" text NOT NULL,
	"pageId" text NOT NULL,
	"axeRuleId" text NOT NULL,
	"selector" text,
	"reason" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_finding" (
	"id" text PRIMARY KEY NOT NULL,
	"manualAuditId" text NOT NULL,
	"pageId" text NOT NULL,
	"sc" text NOT NULL,
	"severity" text NOT NULL,
	"summary" text NOT NULL,
	"description" text,
	"remediation" text,
	"selector" text,
	"html" text,
	"screenshotKey" text,
	"provenance" text NOT NULL,
	"axeRuleId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "isAuditor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_audit" ADD CONSTRAINT "manual_audit_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_audit" ADD CONSTRAINT "manual_audit_auditorUserId_user_id_fk" FOREIGN KEY ("auditorUserId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_audit_check" ADD CONSTRAINT "manual_audit_check_manualAuditId_manual_audit_id_fk" FOREIGN KEY ("manualAuditId") REFERENCES "public"."manual_audit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_audit_check" ADD CONSTRAINT "manual_audit_check_pageId_manual_audit_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."manual_audit_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_audit_page" ADD CONSTRAINT "manual_audit_page_manualAuditId_manual_audit_id_fk" FOREIGN KEY ("manualAuditId") REFERENCES "public"."manual_audit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_dismissal" ADD CONSTRAINT "manual_dismissal_manualAuditId_manual_audit_id_fk" FOREIGN KEY ("manualAuditId") REFERENCES "public"."manual_audit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_dismissal" ADD CONSTRAINT "manual_dismissal_pageId_manual_audit_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."manual_audit_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_finding" ADD CONSTRAINT "manual_finding_manualAuditId_manual_audit_id_fk" FOREIGN KEY ("manualAuditId") REFERENCES "public"."manual_audit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_finding" ADD CONSTRAINT "manual_finding_pageId_manual_audit_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."manual_audit_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_audit_user_idx" ON "manual_audit" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "manual_audit_auditor_idx" ON "manual_audit" USING btree ("auditorUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "manual_audit_check_page_sc" ON "manual_audit_check" USING btree ("pageId","sc");--> statement-breakpoint
CREATE INDEX "manual_audit_check_audit_idx" ON "manual_audit_check" USING btree ("manualAuditId");--> statement-breakpoint
CREATE INDEX "manual_audit_page_audit_idx" ON "manual_audit_page" USING btree ("manualAuditId");--> statement-breakpoint
CREATE INDEX "manual_dismissal_page_idx" ON "manual_dismissal" USING btree ("pageId");--> statement-breakpoint
CREATE INDEX "manual_finding_audit_idx" ON "manual_finding" USING btree ("manualAuditId");--> statement-breakpoint
CREATE INDEX "manual_finding_page_idx" ON "manual_finding" USING btree ("pageId");