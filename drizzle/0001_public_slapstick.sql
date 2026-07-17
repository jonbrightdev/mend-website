CREATE TABLE "apiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"hashedKey" text NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastUsedAt" timestamp,
	"revokedAt" timestamp,
	CONSTRAINT "apiKey_hashedKey_unique" UNIQUE("hashedKey")
);
--> statement-breakpoint
CREATE TABLE "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"url" text NOT NULL,
	"pageTitle" text NOT NULL,
	"scannedAt" timestamp NOT NULL,
	"durationMs" integer,
	"totalChecks" integer,
	"partial" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "violation" (
	"id" text PRIMARY KEY NOT NULL,
	"auditId" text NOT NULL,
	"ruleId" text NOT NULL,
	"impact" text NOT NULL,
	"help" text NOT NULL,
	"helpUrl" text,
	"description" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nodes" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violation" ADD CONSTRAINT "violation_auditId_audit_id_fk" FOREIGN KEY ("auditId") REFERENCES "public"."audit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_user_url_scanned" ON "audit" USING btree ("userId","url","scannedAt");