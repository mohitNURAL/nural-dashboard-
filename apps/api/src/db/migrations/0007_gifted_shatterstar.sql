CREATE TABLE "report_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"period_key" text NOT NULL,
	"recipient" text NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"preview" boolean DEFAULT false NOT NULL,
	"subject" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"state" text DEFAULT 'preview' NOT NULL,
	"definition" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text;--> statement-breakpoint
CREATE INDEX "report_runs_report_idx" ON "report_runs" USING btree ("report_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_runs_once" ON "report_runs" USING btree ("report_id","period_key","recipient","channel");