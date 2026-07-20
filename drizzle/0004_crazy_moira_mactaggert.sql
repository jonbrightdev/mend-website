CREATE TABLE "monitor" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"url" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"pausedAt" timestamp,
	"nextRunAt" timestamp NOT NULL,
	"lastRunAt" timestamp,
	"lastError" text
);
--> statement-breakpoint
ALTER TABLE "monitor" ADD CONSTRAINT "monitor_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monitor_user_url" ON "monitor" USING btree ("userId","url");--> statement-breakpoint
CREATE INDEX "monitor_next_run_idx" ON "monitor" USING btree ("nextRunAt");